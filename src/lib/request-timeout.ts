export async function withRequestTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, milliseconds = 45_000): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('Le serveur ne répond pas dans le délai prévu. La connexion a été interrompue.'))
      controller.abort()
    }, milliseconds)
  })
  try {
    return await Promise.race([Promise.resolve().then(() => operation(controller.signal)), deadline])
  } finally {
    clearTimeout(timer)
  }
}
