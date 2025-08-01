import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import bcrypt from 'bcryptjs'

// Conditionally import Prisma only at runtime
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let prisma: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let PrismaAdapter: any = null

// Only load Prisma during runtime, not build time
if (typeof window === 'undefined' && process.env.DATABASE_URL) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    prisma = require('@/lib/prisma').prisma
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    PrismaAdapter = require('@auth/prisma-adapter').PrismaAdapter
  } catch (error) {
    console.warn('Prisma not available during build:', error)
  }
}

export const authOptions: NextAuthOptions = {
  // Only use adapter if Prisma is available
  ...(prisma && PrismaAdapter ? { adapter: PrismaAdapter(prisma) } : {}),
  session: {
    strategy: 'jwt'
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET 
      ? [GoogleProvider({
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        })]
      : []
    ),
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email', placeholder: 'john@example.com' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Invalid credentials')
        }

        // Only use Prisma if available
        if (!prisma) {
          throw new Error('Database not available')
        }

        const user = await prisma.user.findUnique({
          where: {
            email: credentials.email
          }
        })

        if (!user || !user.hashedPassword) {
          throw new Error('Invalid credentials')
        }

        const isCorrectPassword = await bcrypt.compare(
          credentials.password,
          user.hashedPassword
        )

        if (!isCorrectPassword) {
          throw new Error('Invalid credentials')
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          isPremium: user.isPremium,
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.email = user.email
        token.name = user.name
        token.isPremium = (user as { isPremium: boolean }).isPremium
      }
      return token
    },
    async session({ session, token }) {
      if (session?.user) {
        session.user.id = token.id as string
        session.user.email = token.email as string
        session.user.name = token.name as string
        session.user.isPremium = token.isPremium as boolean
      }
      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET || 'fallback-secret-for-build',
}