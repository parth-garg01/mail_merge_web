// WebSocket client — replaces window.api.on / window.api.off from the Electron preload

const handlers = {}
let socket = null
let reconnectTimer = null

function connect() {
  if (socket && socket.readyState <= 1) return  // already connecting or open

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  socket = new WebSocket(`${protocol}//${location.host}/ws`)

  socket.onmessage = (event) => {
    try {
      const { event: name, data } = JSON.parse(event.data)
      const cbs = handlers[name]
      if (cbs) cbs.forEach(cb => cb(data))
    } catch {}
  }

  socket.onclose = () => {
    clearTimeout(reconnectTimer)
    reconnectTimer = setTimeout(connect, 3000)
  }

  socket.onerror = () => {
    socket.close()
  }
}

connect()

export function wsOn(event, cb) {
  if (!handlers[event]) handlers[event] = []
  handlers[event].push(cb)
}

export function wsOff(event, cb) {
  if (!handlers[event]) return
  handlers[event] = handlers[event].filter(fn => fn !== cb)
}
