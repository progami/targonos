import { sendArgusAlertEmail } from './alert-email.mjs'

function readFlag(argv, flag) {
  const index = argv.indexOf(flag)
  if (index < 0) return null
  return argv[index + 1] ?? null
}

async function main() {
  const argv = process.argv.slice(2)
  const subject = readFlag(argv, '--subject')
  const text = readFlag(argv, '--text')

  if (!subject || !text) {
    throw new Error('Usage: node send-alert-email.mjs --subject "<subject>" --text "<text>"')
  }

  await sendArgusAlertEmail({ subject, text })
}

main().catch((error) => {
  if (error instanceof Error) {
    if (error.stack) {
      console.error(error.stack)
    } else {
      console.error(error.message)
    }
  } else {
    console.error(String(error))
  }
  process.exit(1)
})
