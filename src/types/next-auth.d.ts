import 'next-auth'
import 'next-auth/jwt'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      image?: string | null
      avatar?: string | null
      accessToken?: string
      refreshToken?: string
      expiresAt?: number
    }
  }

  interface User {
    id: string
    email: string
    name?: string | null
    avatar?: string | null
    accessToken?: string
    refreshToken?: string
    expiresAt?: number
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    accessToken?: string
    refreshToken?: string
    expiresAt?: number
    error?: string
  }
}
