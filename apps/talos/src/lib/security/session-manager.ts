import { PrismaClient } from '@targon/prisma-talos';

function resolveDatasourceUrl(): string | undefined {
 const databaseUrl = process.env.DATABASE_URL;
 if (typeof databaseUrl !== 'string') {
 return undefined;
 }

 const url = new URL(databaseUrl);
 url.searchParams.set('application_name', 'talos-session-manager');
 return url.toString();
}

const prisma = new PrismaClient({
 datasourceUrl: resolveDatasourceUrl(),
});

interface SessionData {
 userId: string;
 role: string;
 warehouseId?: string | null;
 createdAt: number;
 lastActivity: number;
 ipAddress?: string;
 userAgent?: string;
}

const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const MAX_SESSION_AGE = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CONCURRENT_SESSIONS = 3;

class SessionManager {
 private sessions: Map<string, SessionData> = new Map();

 generateSessionId(): string {
 // Generate random bytes using Web Crypto API
 const buffer = new Uint8Array(32);
 crypto.getRandomValues(buffer);
 
 // Convert to hex string
 return Array.from(buffer)
 .map(b => b.toString(16).padStart(2, '0'))
 .join('');
 }

 async createSession(
 userId: string, 
 role: string, 
 warehouseId?: string | null,
 ipAddress?: string,
 userAgent?: string
 ): Promise<string> {
 // Clean up old sessions for this user
 await this.limitUserSessions(userId);

 const sessionId = this.generateSessionId();
 const now = Date.now();

 const sessionData: SessionData = {
 userId,
 role,
 warehouseId,
 createdAt: now,
 lastActivity: now,
 ipAddress,
 userAgent
 };

 this.sessions.set(sessionId, sessionData);
 return sessionId;
 }

 async getSession(sessionId: string): Promise<SessionData | null> {
 const session = this.sessions.get(sessionId);
 
 if (!session) {
 return null;
 }

 const now = Date.now();
 
 // Check session age
 if (now - session.createdAt > MAX_SESSION_AGE) {
 this.sessions.delete(sessionId);
 return null;
 }

 // Check inactivity
 if (now - session.lastActivity > INACTIVITY_TIMEOUT) {
 this.sessions.delete(sessionId);
 return null;
 }

 // Update last activity
 session.lastActivity = now;

 // Revalidate user data from database
 const user = await prisma.user.findUnique({
 where: { id: session.userId }
 });

 if (!user || user.role !== session.role) {
 // User role changed or user deleted
 this.sessions.delete(sessionId);
 return null;
 }

 // Update session with current user data
 session.role = user.role;
 session.warehouseId = user.warehouseId;

 return session;
 }

 async invalidateSession(sessionId: string): Promise<void> {
 this.sessions.delete(sessionId);
 }

 async invalidateUserSessions(userId: string): Promise<void> {
 for (const [sessionId, session] of this.sessions.entries()) {
 if (session.userId === userId) {
 this.sessions.delete(sessionId);
 }
 }
 }

 private async limitUserSessions(userId: string): Promise<void> {
 const userSessions: Array<[string, SessionData]> = [];
 
 for (const [sessionId, session] of this.sessions.entries()) {
 if (session.userId === userId) {
 userSessions.push([sessionId, session]);
 }
 }

 // Sort by creation time (oldest first)
 userSessions.sort((a, b) => a[1].createdAt - b[1].createdAt);

 // Remove oldest sessions if limit exceeded
 while (userSessions.length >= MAX_CONCURRENT_SESSIONS) {
 const [oldestSessionId] = userSessions.shift()!;
 this.sessions.delete(oldestSessionId);
 }
 }

 // Clean up expired sessions periodically
 startCleanup(): void {
 setInterval(() => {
 const now = Date.now();
 
 for (const [sessionId, session] of this.sessions.entries()) {
 if (
 now - session.createdAt > MAX_SESSION_AGE ||
 now - session.lastActivity > INACTIVITY_TIMEOUT
 ) {
 this.sessions.delete(sessionId);
 }
 }
 }, 5 * 60 * 1000); // Every 5 minutes
 }
}

// Singleton instance
let sessionManagerInstance: SessionManager | null = null;

export function getSessionManager(): SessionManager {
 if (!sessionManagerInstance) {
 sessionManagerInstance = new SessionManager();
 sessionManagerInstance.startCleanup();
 }
 return sessionManagerInstance;
}

// Helper to validate session from request
export async function validateSession(sessionId: string): Promise<SessionData | null> {
 const manager = getSessionManager();
 return manager.getSession(sessionId);
}

// Helper to create new session
export async function createUserSession(
 userId: string,
 role: string,
 warehouseId?: string | null,
 ipAddress?: string,
 userAgent?: string
): Promise<string> {
 const manager = getSessionManager();
 return manager.createSession(userId, role, warehouseId, ipAddress, userAgent);
}

// Helper to invalidate session
export async function invalidateUserSession(sessionId: string): Promise<void> {
 const manager = getSessionManager();
 return manager.invalidateSession(sessionId);
}

// Helper to invalidate all user sessions (e.g., on role change)
export async function invalidateAllUserSessions(userId: string): Promise<void> {
 const manager = getSessionManager();
 return manager.invalidateUserSessions(userId);
}
