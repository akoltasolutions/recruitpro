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
  status: 'idle' | 'monitoring'
  streamViewers: Set<string> // admin socket IDs currently viewing
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

const recruiters = new Map<string, ConnectedRecruiter>()
const admins = new Map<string, ConnectedAdmin>()
const socketToUserId = new Map<string, string>()

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
  for (const [, admin] of admins) {
    io.to(admin.socketId).emit('recruiter-list', getRecruiterList())
  }
}

function stopMonitoringRecruiter(recruiter: ConnectedRecruiter) {
  recruiter.status = 'idle'
  const viewers = Array.from(recruiter.streamViewers)
  recruiter.streamViewers.clear()

  // Notify all viewers that monitoring ended
  for (const viewerSocketId of viewers) {
    io.to(viewerSocketId).emit('monitoring-ended', {
      userId: recruiter.userId,
      reason: 'stopped',
    })
    const admin = admins.get(viewerSocketId)
    if (admin && admin.viewingUserId === recruiter.userId) {
      admin.viewingUserId = null
    }
  }

  broadcastRecruiterList()
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
      for (const viewerSocketId of existing.streamViewers) {
        io.to(viewerSocketId).emit('monitoring-ended', { userId, reason: 'reconnected' })
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

    socket.emit('recruiter-list', getRecruiterList())
    console.log(`[ScreenMonitor] Admin registered: ${name} (${userId})`)
  })

  // ---- Admin starts monitoring a recruiter ----
  socket.on('start-monitoring', (data: { targetUserId: string }) => {
    const admin = admins.get(socket.id)
    const recruiter = recruiters.get(data.targetUserId)
    if (!admin || !recruiter) return

    // Stop viewing previous recruiter if any
    if (admin.viewingUserId && admin.viewingUserId !== data.targetUserId) {
      const prevRecruiter = recruiters.get(admin.viewingUserId)
      if (prevRecruiter) {
        prevRecruiter.streamViewers.delete(socket.id)
        if (prevRecruiter.streamViewers.size === 0) {
          // Tell recruiter to stop capturing (no viewers left)
          io.to(`recruiter-${prevRecruiter.userId}`).emit('stop-capture')
          stopMonitoringRecruiter(prevRecruiter)
        }
      }
    }

    // If recruiter isn't monitoring yet, tell them to start capturing
    if (recruiter.status !== 'monitoring') {
      io.to(`recruiter-${data.targetUserId}`).emit('start-capture')
      recruiter.status = 'monitoring'
      broadcastRecruiterList()
      console.log(`[ScreenMonitor] Admin ${admin.name} started monitoring ${recruiter.name}`)
    }

    // Register this admin as a viewer
    admin.viewingUserId = data.targetUserId
    recruiter.streamViewers.add(socket.id)

    // Tell admin to start viewing
    socket.emit('monitoring-started', {
      userId: data.targetUserId,
      name: recruiter.name,
    })

    console.log(`[ScreenMonitor] Admin ${admin.name} viewing ${recruiter.name} (${recruiter.streamViewers.size} viewers)`)
  })

  // ---- Admin stops monitoring ----
  socket.on('stop-monitoring', (data: { targetUserId: string }) => {
    const admin = admins.get(socket.id)
    const recruiter = recruiters.get(data.targetUserId)
    if (!admin || !recruiter) return

    recruiter.streamViewers.delete(socket.id)
    admin.viewingUserId = null

    // Tell admin their view has ended
    socket.emit('monitoring-ended', { userId: data.targetUserId, reason: 'stopped' })

    // If no more viewers, tell recruiter to stop capturing silently
    if (recruiter.streamViewers.size === 0) {
      io.to(`recruiter-${data.targetUserId}`).emit('stop-capture')
      recruiter.status = 'idle'
      broadcastRecruiterList()
    }

    console.log(`[ScreenMonitor] Admin ${admin.name} stopped monitoring ${recruiter.name}`)
  })

  // ---- Recruiter sends a screen frame ----
  socket.on('screen-frame', (data: { userId: string; frame: string; timestamp: number }) => {
    const recruiter = recruiters.get(data.userId)
    if (!recruiter || recruiter.status !== 'monitoring') return

    // Forward frame ONLY to admins actively viewing this recruiter
    for (const viewerSocketId of recruiter.streamViewers) {
      io.to(viewerSocketId).emit('screen-frame', {
        userId: data.userId,
        frame: data.frame,
        timestamp: data.timestamp,
      })
    }
  })

  // ---- Recruiter reports capture failure ----
  socket.on('capture-failed', (data: { userId: string; reason: string }) => {
    const recruiter = recruiters.get(data.userId)
    if (!recruiter) return

    recruiter.status = 'idle'
    broadcastRecruiterList()

    // Notify all viewers
    for (const viewerSocketId of recruiter.streamViewers) {
      io.to(viewerSocketId).emit('monitoring-ended', {
        userId: data.userId,
        reason: 'capture-denied',
      })
      const admin = admins.get(viewerSocketId)
      if (admin && admin.viewingUserId === data.userId) {
        admin.viewingUserId = null
      }
    }
    recruiter.streamViewers.clear()

    console.log(`[ScreenMonitor] Capture failed for ${recruiter.name}: ${data.reason}`)
  })

  // ---- Disconnect ----
  socket.on('disconnect', () => {
    const userId = socketToUserId.get(socket.id)
    socketToUserId.delete(socket.id)

    // Check if recruiter disconnected
    for (const [recruiterUserId, recruiter] of recruiters) {
      if (recruiter.socketId === socket.id) {
        for (const viewerSocketId of recruiter.streamViewers) {
          io.to(viewerSocketId).emit('monitoring-ended', {
            userId: recruiterUserId,
            reason: 'disconnected',
          })
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
        for (const [, recruiter] of recruiters) {
          recruiter.streamViewers.delete(socket.id)
          if (recruiter.streamViewers.size === 0 && recruiter.status === 'monitoring') {
            io.to(`recruiter-${recruiter.userId}`).emit('stop-capture')
            recruiter.status = 'idle'
            broadcastRecruiterList()
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
