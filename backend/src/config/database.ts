import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../generated/prisma/client.js'
import { env } from './env.js'

export type Database = Pick<PrismaClient, 'project' | 'milestone' | 'payment' | '$transaction'>

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL })

export const prisma = new PrismaClient({ adapter })
