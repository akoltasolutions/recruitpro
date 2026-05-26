import { createServer } from 'http'
import { Server } from 'socket.io'

const httpServer = createServer()
const io = new Server(httpServer, {
  // DO NOT change the path, it is used by Caddy to forward the request to the correct port
  path: '/',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 5 * 1024 * 1024, // 5 MB per frame
})

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConnectedRecruiter {
  socketId: string
  userId: string
  name: string
  status: 'idle' | 'streaming' | 'paused'
  streamViewers: Set<string> // admin socket IDs currently viewing this recruiter
  connectedAt: number
}

interface ConnectedAdmin {
  socketId: string
  userId: string
  name: string
  viewingUserId: string | null
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const recruiters = new Map<string, ConnectedRecruiter>()   // keyed by userId
const admins = new Map<string, ConnectedAdmin>()           // keyed by socketId
const socketToUserId = new Map<string, string>()           // socketId → userId (all clients)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRecruiterList() {
  return Array.from(recruiters.values()).map((r) => ({
    userId: r.userId,
    name: r.name,
    status: r.status,
    connectedAt: r.connectedAt,
  }))
}

function broadcastRecruiterList() {
  // Send updated list to all connected admins
  for (const [, admin] of admins) {
    io.to(admin.socketId).emit('recruiter-list', getRecruiterList())
  }
}

// ---------------------------------------------------------------------------
// Connection handler
// ---------------------------------------------------------------------------

io.on('connection', (socket) => {
  console.log(`[ScreenMonitor] Connected: ${socket.id}`)

  // ---- Recruiter registers ----
  socket.on('recruiter-register', (data: { userId: string; name: string }) => {
    const { userId, name } = data
    socketToUserId.set(socket.id, userId)

    // Remove previous connection if exists
    const existing = recruiters.get(userId)
    if (existing) {
      // Notify any admins viewing the old connection
      for (const viewerSocketId of existing.streamViewers) {
        io.to(viewerSocketId).emit('screen-ended', { userId, reason: 'reconnected' })
      }
      io.sockets.sockets.get(existing.socketId)?.disconnect(true)
    }

    recruiters.set(userId, {
      socketId: socket.id,
      userId,
      name,
      status: 'idle',
      streamViewers: new Set(),
      connectedAt: Date.now(),
    })

    socket.join(`recruiter-${userId}`)
    console.log(`[ScreenMonitor] Recruiter registered: ${name} (${userId})`)
    broadcastRecruiterList()
  })

  // ---- Admin registers ----
  socket.on('admin-register', (data: { userId: string; name: string }) => {
    const { userId, name } = data
    socketToUserId.set(socket.id, userId)

    admins.set(socket.id, {
      socketId: socket.id,
      userId,
      name,
      viewingUserId: null,
    })

    // Send current recruiter list
    socket.emit('recruiter-list', getRecruiterList())
    console.log(`[ScreenMonitor] Admin registered: ${name} (${userId})`)
  })

  // ---- Admin requests to view a recruiter's screen ----
  socket.on('request-screen', (data: { targetUserId: string }) => {
    const admin = admins.get(socket.id)
    const recruiter = recruiters.get(data.targetUserId)
    if (!admin || !recruiter) return

    // Forward request to recruiter
    io.to(`recruiter-${data.targetUserId}`).emit('screen-request', {
      adminName: admin.name,
      adminId: admin.userId,
    })

    console.log(`[ScreenMonitor] Admin ${admin.name} requested screen of ${recruiter.name}`)
  })

  // ---- Recruiter accepts screen share ----
  socket.on('screen-share-start', (data: { userId: string }) => {
    const recruiter = recruiters.get(data.userId)
    if (!recruiter) return

    recruiter.status = 'streaming'
    console.log(`[ScreenMonitor] ${recruiter.name} started sharing screen`)
    broadcastRecruiterList()

    // Notify all admins who might be waiting
    for (const [, admin] of admins) {
      io.to(admin.socketId).emit('screen-share-started', {
        userId: data.userId,
        name: recruiter.name,
      })
    }
  })

  // ---- Recruiter sends a screen frame ----
  socket.on('screen-frame', (data: { userId: string; frame: string; timestamp: number }) => {
    const recruiter = recruiters.get(data.userId)
    if (!recruiter || recruiter.status !== 'streaming') return

    // Forward frame to all viewers
    for (const viewerSocketId of recruiter.streamViewers) {
      io.to(viewerSocketId).emit('screen-frame', {
        userId: data.userId,
        frame: data.frame,
        timestamp: data.timestamp,
      })
    }
  })

  // ---- Admin starts viewing a specific recruiter ----
  socket.on('view-screen', (data: { targetUserId: string }) => {
    const admin = admins.get(socket.id)
    const recruiter = recruiters.get(data.targetUserId)
    if (!admin || !recruiter) return

    // Stop viewing previous recruiter if any
    if (admin.viewingUserId && admin.viewingUserId !== data.targetUserId) {
      const prevRecruiter = recruiters.get(admin.viewingUserId)
      if (prevRecruiter) {
        prevRecruiter.streamViewers.delete(socket.id)
        // If no more viewers, optionally notify recruiter
        if (prevRecruiter.streamViewers.size === 0 && prevRecruiter.status === 'streaming') {
          io.to(`recruiter-${prevRecruiter.userId}`).emit('viewers-count', { count: 0 })
        }
      }
    }

    admin.viewingUserId = data.targetUserId
    recruiter.streamViewers.add(socket.id)
    io.to(`recruiter-${data.targetUserId}`).emit('viewers-count', {
      count: recruiter.streamViewers.size,
    })

    console.log(`[ScreenMonitor] Admin ${admin.name} is now viewing ${recruiter.name} (${recruiter.streamViewers.size} viewers)`)
  })

  // ---- Admin stops viewing ----
  socket.on('stop-viewing', (data: { targetUserId: string }) => {
    const admin = admins.get(socket.id)
    const recruiter = recruiters.get(data.targetUserId)
    if (!admin || !recruiter) return

    recruiter.streamViewers.delete(socket.id)
    admin.viewingUserId = null

    io.to(`recruiter-${data.targetUserId}`).emit('viewers-count', {
      count: recruiter.streamViewers.size,
    })

    // If recruiter is streaming but has no viewers, notify them
    if (recruiter.streamViewers.size === 0) {
      io.to(`recruiter-${data.targetUserId}`).emit('no-viewers')
    }

    console.log(`[ScreenMonitor] Admin ${admin.name} stopped viewing ${recruiter.name}`)
  })

  // ---- Recruiter stops screen share ----
  socket.on('screen-share-stop', (data: { userId: string }) => {
    const recruiter = recruiters.get(data.userId)
    if (!recruiter) return

    recruiter.status = 'idle'
    recruiter.streamViewers.clear()

    // Notify all viewers
    for (const viewerSocketId of recruiter.streamViewers) {
      io.to(viewerSocketId).emit('screen-ended', { userId: data.userId, reason: 'stopped' })
    }

    // Update admins who were viewing
    for (const [, admin] of admins) {
      if (admin.viewingUserId === data.userId) {
        admin.viewingUserId = null
      }
      io.to(admin.socketId).emit('screen-share-stopped', { userId: data.userId })
    }

    broadcastRecruiterList()
    console.log(`[ScreenMonitor] ${recruiter.name} stopped sharing screen`)
  })

  // ---- Disconnect ----
  socket.on('disconnect', () => {
    const userId = socketToUserId.get(socket.id)
    socketToUserId.delete(socket.id)

    // Check if recruiter disconnected
    for (const [recruiterUserId, recruiter] of recruiters) {
      if (recruiter.socketId === socket.id) {
        // Notify all viewers
        for (const viewerSocketId of recruiter.streamViewers) {
          io.to(viewerSocketId).emit('screen-ended', { userId: recruiterUserId, reason: 'disconnected' })
          const admin = admins.get(viewerSocketId)
          if (admin && admin.viewingUserId === recruiterUserId) {
            admin.viewingUserId = null
          }
        }
        recruiters.delete(recruiterUserId)
        broadcastRecruiterList()
        console.log(`[ScreenMonitor] Recruiter disconnected: ${recruiter.name}`)
        break
      }
    }

    // Check if admin disconnected
    for (const [adminSocketId, admin] of admins) {
      if (adminSocketId === socket.id) {
        // Remove from any recruiter's viewer list
        for (const [, recruiter] of recruiters) {
          recruiter.streamViewers.delete(socket.id)
          if (recruiter.streamViewers.size === 0 && recruiter.status === 'streaming') {
            io.to(`recruiter-${recruiter.userId}`).emit('viewers-count', { count: 0 })
          }
        }
        admins.delete(socket.id)
        console.log(`[ScreenMonitor] Admin disconnected: ${admin.name}`)
        break
      }
    }
  })

  socket.on('error', (error) => {
    console.error(`[ScreenMonitor] Socket error (${socket.id}):`, error)
  })
})

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

const PORT = 3004
httpServer.listen(PORT, () => {
  console.log(`[ScreenMonitor] WebSocket server running on port ${PORT}`)
})

process.on('SIGTERM', () => {
  console.log('[ScreenMonitor] Shutting down...')
  httpServer.close(() => process.exit(0))
})

process.on('SIGINT', () => {
  console.log('[ScreenMonitor] Shutting down...')
  httpServer.close(() => process.exit(0))
})
