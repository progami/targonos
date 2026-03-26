import { Pool } from 'pg'

function resolveDatabaseUrl(): string | undefined {
 const databaseUrl = process.env.DATABASE_URL
 if (typeof databaseUrl !== 'string') {
 return undefined
 }

 const url = new URL(databaseUrl)
 url.searchParams.set('application_name', 'talos-pg')
 return url.toString()
}

// Create a connection pool
export const pool = new Pool({
 connectionString: resolveDatabaseUrl(),
 max: 20, // Maximum number of clients in the pool
 idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
 connectionTimeoutMillis: 2000, // How long to wait for a connection
})

// Test the connection
pool.on('error', (_err) => {
 // console.error('Unexpected error on idle client', err)
})

// Helper function to get a client from the pool
export async function getClient() {
 try {
 const client = await pool.connect()
 return client
 } catch (_error) {
 // console.error('Error connecting to database:', _error)
 throw _error
 }
}

// Helper function to run a query
export async function query(text: string, params?: unknown[]) {
 try {
 const result = await pool.query(text, params)
 return result
 } catch (_error) {
 // console.error('Database query error:', _error)
 throw _error
 }
}
