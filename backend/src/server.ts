import { createApp } from './app.js'
import { env } from './config/env.js'
import { prisma } from './config/database.js'

const server = createApp().listen(env.PORT, () => {
  console.log(`ScopePay API listening on port ${env.PORT}`)
})

function shutdown() {
  server.close(() => {
    void prisma.$disconnect().then(() => process.exit(0))
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
