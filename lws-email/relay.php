<?php
declare(strict_types=1);

function itemsRelayReply(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function itemsRelayReject(int $status, string $code): void
{
    itemsRelayReply($status, ['error' => $code]);
}

function itemsRelayHandle(): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        header('Allow: POST');
        itemsRelayReject(405, 'MAIL_RELAY_METHOD_NOT_ALLOWED');
        return;
    }
    $loopback = in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true)
        && in_array($_SERVER['SERVER_NAME'] ?? '', ['127.0.0.1', 'localhost', '::1'], true);
    if (!$loopback && ($_SERVER['HTTPS'] ?? '') !== 'on' && ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') !== 'https') {
        itemsRelayReject(400, 'MAIL_RELAY_HTTPS_REQUIRED');
        return;
    }
    if (strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') {
        itemsRelayReject(415, 'MAIL_RELAY_INVALID_PAYLOAD');
        return;
    }
    $raw = file_get_contents('php://input', false, null, 0, 4097);
    if (!is_string($raw) || strlen($raw) > 4096) {
        itemsRelayReject(413, 'MAIL_RELAY_INVALID_PAYLOAD');
        return;
    }
    $path = __DIR__ . '/relay-config.local.php';
    if (!is_file($path)) {
        itemsRelayReject(503, 'MAIL_RELAY_NOT_CONFIGURED');
        return;
    }
    try {
        if (!defined('ITEMS_MAIL_RELAY_CONFIG_LOAD')) define('ITEMS_MAIL_RELAY_CONFIG_LOAD', true);
        $config = require $path;
        if (!is_array($config) || !preg_match('/^[a-f0-9]{64}$/D', $config['secret'] ?? '')) {
            itemsRelayReject(503, 'MAIL_RELAY_NOT_CONFIGURED');
            return;
        }
        $signature = $_SERVER['HTTP_X_ITEMSTRACKER_SIGNATURE'] ?? '';
        if (!preg_match('/^[a-f0-9]{64}$/D', $signature) || !hash_equals(hash_hmac('sha256', $raw, $config['secret']), $signature)) {
            itemsRelayReject(401, 'MAIL_RELAY_AUTH_FAILED');
            return;
        }
        $data = json_decode($raw, true);
        $kind = is_array($data) ? ($data['kind'] ?? '') : '';
        $pattern = $kind === 'verification' ? '/^[0-9]{6}$/D' : ($kind === 'password-reset' ? '/^[0-9]{8}$/D' : null);
        if (!is_array($data) || !$pattern || !is_string($data['to'] ?? null) || !filter_var($data['to'], FILTER_VALIDATE_EMAIL)
            || !is_string($data['code'] ?? null) || !preg_match($pattern, $data['code'])
            || !is_int($data['timestamp'] ?? null) || abs(time() - $data['timestamp']) > 90
            || !is_string($data['requestId'] ?? null) || !preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/D', $data['requestId'])
            || array_diff(array_keys($data), ['to', 'kind', 'code', 'timestamp', 'requestId'])) {
            itemsRelayReject(400, 'MAIL_RELAY_INVALID_PAYLOAD');
            return;
        }
        foreach (['smtpHost', 'smtpUser', 'smtpPass', 'fromEmail'] as $field) {
            if (!is_string($config[$field] ?? null) || $config[$field] === '') {
                itemsRelayReject(503, 'MAIL_RELAY_NOT_CONFIGURED');
                return;
            }
        }
        $secure = $config['smtpSecure'] ?? 'ssl';
        $localSmtp = in_array($config['smtpHost'], ['127.0.0.1', 'localhost', '::1'], true);
        if (!in_array($secure, ['ssl', 'tls'], true) && !($loopback && $localSmtp && $secure === '')) {
            itemsRelayReject(503, 'MAIL_RELAY_NOT_CONFIGURED');
            return;
        }
        if (!filter_var($config['fromEmail'], FILTER_VALIDATE_EMAIL) || !is_int($config['smtpPort'] ?? null)
            || $config['smtpPort'] < 1 || $config['smtpPort'] > 65535) {
            itemsRelayReject(503, 'MAIL_RELAY_NOT_CONFIGURED');
            return;
        }
        itemsRelaySend($config, $data, $raw);
    } catch (Throwable $error) {
        // Do not output/log the exception or SMTP response; these can contain secrets.
        error_log('ItemsTracker mail relay: MAIL_RELAY_INTERNAL_ERROR');
        itemsRelayReject(503, 'MAIL_RELAY_INTERNAL_ERROR');
    }
}

function itemsRelaySend(array $config, array $data, string $raw): void
{
    // Local file locks work on shared hosting without requiring a database.
    $oldMask = umask(0077);
    $directory = sys_get_temp_dir() . '/itemstracker-relay-' . substr(hash('sha256', __DIR__ . $config['secret']), 0, 24);
    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) throw new RuntimeException('State unavailable');
    $lock = fopen($directory . '/state.json', 'c+');
    umask($oldMask);
    if (!$lock || !flock($lock, LOCK_EX)) throw new RuntimeException('Lock unavailable');
    try {
        $saved = stream_get_contents($lock);
        $state = json_decode($saved ?: '{}', true);
        if (!is_array($state)) throw new RuntimeException('Invalid relay state');
        $now = time();
        $state['requests'] = array_filter($state['requests'] ?? [], static function ($entry) use ($now) { return $entry['at'] > $now - 180; });
        $state['sent'] = array_values(array_filter($state['sent'] ?? [], static function ($entry) use ($now) { return $entry['at'] > $now - 900; }));
        $previous = $state['requests'][$data['requestId']] ?? null;
        $payloadHash = hash('sha256', $raw);
        if ($previous) {
            if (!hash_equals($previous['hash'], $payloadHash)) itemsRelayReject(409, 'MAIL_RELAY_INVALID_PAYLOAD');
            else itemsRelayReply(200, ['ok' => true, 'messageId' => $data['requestId']]);
            return;
        }
        $recipientHash = hash_hmac('sha256', strtolower($data['to']), $config['secret']);
        $minute = 0; $recipient = 0;
        foreach ($state['sent'] as $entry) {
            if ($entry['at'] > $now - 60) $minute++;
            if (hash_equals($entry['recipient'], $recipientHash)) $recipient++;
        }
        if ($minute >= 60 || $recipient >= 5) {
            header('Retry-After: 60');
            itemsRelayReject(429, 'MAIL_RELAY_RATE_LIMITED');
            return;
        }
        require_once __DIR__ . '/vendor/phpmailer/Exception.php';
        require_once __DIR__ . '/vendor/phpmailer/PHPMailer.php';
        require_once __DIR__ . '/vendor/phpmailer/SMTP.php';
        $mail = new \PHPMailer\PHPMailer\PHPMailer(true);
        $mail->isSMTP();
        $mail->Host = $config['smtpHost'];
        $mail->Port = $config['smtpPort'];
        $mail->SMTPSecure = $config['smtpSecure'];
        $mail->SMTPAuth = true;
        $mail->Username = $config['smtpUser'];
        $mail->Password = $config['smtpPass'];
        $mail->Timeout = 8;
        $mail->getSMTPInstance()->Timelimit = 10;
        $mail->SMTPDebug = 0;
        $mail->SMTPOptions = ['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'allow_self_signed' => false]];
        $mail->CharSet = 'UTF-8';
        $mail->setFrom($config['fromEmail'], $config['fromName'] ?? 'ItemsTracker');
        $mail->addAddress($data['to']);
        $verification = $data['kind'] === 'verification';
        $mail->Subject = $verification ? 'Votre code de vérification ItemsTracker' : 'Réinitialisation de votre mot de passe ItemsTracker';
        $title = $verification ? 'Confirmez votre adresse e-mail.' : 'Réinitialisez votre mot de passe.';
        $code = $data['code'];
        $mail->isHTML(true);
        $mail->Body = '<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:32px;color:#14233d"><strong style="color:#1767ff">ItemsTracker</strong><h1 style="font-size:24px">' . $title . '</h1><p>Saisissez ce code dans ItemsTracker :</p><p style="font-size:36px;font-weight:700;letter-spacing:6px;color:#1767ff;background:#edf4ff;padding:24px;text-align:center">' . $code . '</p><p>Valable 15 minutes. Ne partagez pas ce code.</p><p style="font-size:12px;color:#667085">Si vous n’avez pas fait cette demande, ignorez cet e-mail.</p></div>';
        $mail->AltBody = $title . "\n\nVotre code : " . $code . "\n\nValable 15 minutes. Ne le partagez pas. Si vous n’avez pas fait cette demande, ignorez cet e-mail.";
        try { $mail->send(); }
        catch (Throwable $error) {
            $smtpError = $mail->getSMTPInstance()->getError();
            $code = (int) ($smtpError['smtp_code'] ?? 0) === 535 ? 'MAIL_RELAY_SMTP_AUTH_FAILED' : 'MAIL_RELAY_SMTP_FAILED';
            // PHPMailer can clear the SMTP error after QUIT; classify its own message without logging it.
            if (stripos($mail->ErrorInfo, 'authenticate') !== false) $code = 'MAIL_RELAY_SMTP_AUTH_FAILED';
            if (stripos($smtpError['error'] ?? '', 'timed out') !== false) $code = 'MAIL_RELAY_SMTP_TIMEOUT';
            error_log('ItemsTracker mail relay: ' . $code);
            itemsRelayReject(503, $code);
            return;
        }
        $state['requests'][$data['requestId']] = ['hash' => $payloadHash, 'at' => $now];
        $state['sent'][] = ['at' => $now, 'recipient' => $recipientHash];
        rewind($lock);
        $encoded = json_encode($state);
        if (!ftruncate($lock, 0) || fwrite($lock, $encoded) !== strlen($encoded) || !fflush($lock)) throw new RuntimeException('State write failed');
        itemsRelayReply(200, ['ok' => true, 'messageId' => $data['requestId']]);
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}
