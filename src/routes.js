const { MessageMedia } = require('whatsapp-web.js')
const fs = require('fs')
const routes = require('express').Router()
const qrcode = require('qrcode-terminal')
const { apikeyMiddleware, sessionValidationMiddleware, sessionNameValidationMiddleware, rateLimiterMiddleware } = require('./middleware')
const { sessionFolderPath, enableLocalCallbackExample } = require('./config')
const { sessions, setupSession, deleteSession, validateSession, flushSessions } = require('./sessions')
const { sendErrorResponse, waitForNestedObject } = require('./utils')

// API endpoint to check if server is alive
routes.get('/ping', (req, res) => {
  try {
    res.json({ success: true, message: 'pong' })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
})

// API basic callback
if (enableLocalCallbackExample) {
  routes.post('/localCallbackExample', [apikeyMiddleware, rateLimiterMiddleware], (req, res) => {
    try {
      const { dataType, data } = req.body
      if (dataType === 'qr') { qrcode.generate(data.qr, { small: true }) }
      fs.writeFile(`${sessionFolderPath}/message_log.txt`, `${JSON.stringify(req.body)}\r\n`, { flag: 'a+' }, _ => _)
      res.json({ success: true })
    } catch (error) {
      console.log(error)
      fs.writeFile(`${sessionFolderPath}/message_log.txt`, `(ERROR) ${JSON.stringify(error)}\r\n`, { flag: 'a+' }, _ => _)
      sendErrorResponse(res, 500, error.message)
    }
  })
}

// API endpoint for starting the session
routes.get('/api/startSession/:sessionId', [apikeyMiddleware, sessionNameValidationMiddleware], async (req, res) => {
  try {
    const sessionId = req.params.sessionId
    const setupSessionReturn = setupSession(sessionId)
    if (!setupSessionReturn.success) { sendErrorResponse(res, 422, setupSessionReturn.message); return }

    // wait until the client is created
    waitForNestedObject(setupSessionReturn.client, 'pupPage')
      .then(res.json({ success: true, message: setupSessionReturn.message }))
      .catch((err) => { sendErrorResponse(res, 500, err.message) })
  } catch (error) {
    console.log('startSession ERROR', error)
    sendErrorResponse(res, 500, error)
  }
})

// API endpoint for sending a message
routes.post('/api/sendMessage/:sessionId', [apikeyMiddleware, sessionNameValidationMiddleware, sessionValidationMiddleware], async (req, res) => {
  try {
    const { chatId, content, contentType, options } = req.body
    const client = sessions.get(req.params.sessionId)

    let messageOut
    switch (contentType) {
      case 'string':
        messageOut = await client.sendMessage(chatId, content, options)
        break
      case 'MessageMediaFromURL': {
        const messageMediaFromURL = await MessageMedia.fromUrl(content)
        messageOut = await client.sendMessage(chatId, messageMediaFromURL, options)
        break
      }
      case 'MessageMedia': {
        const messageMedia = new MessageMedia(content.mimetype, content.data, content.filename, content.filesize)
        messageOut = await client.sendMessage(chatId, messageMedia, options)
        break
      }
      /* Disabled - non functioning anymore
      case 'Location':
        const location = new Location(content.latitude, content.longitude, content.description)
        messageOut = await client.sendMessage(chatId, location, options)
        break
      case 'Buttons':
        const buttons = new Buttons(content.body, content.buttons, content.title, content.footer)
        messageOut = await client.sendMessage(chatId, buttons, options)
        break
      case 'List':
        const list = new List(content.body, content.list, content.title, content.footer)
        messageOut = await client.sendMessage(chatId, list, options)
        break
      */
      default:
        return sendErrorResponse(res, 404, 'contentType invalid, must be string, MessageMedia, MessageMediaFromURL, Location, Buttons, or List')
    }

    res.json({ success: true, message: messageOut })
  } catch (error) {
    console.log(error)
    sendErrorResponse(res, 500, error.message)
  }
})

// API endpoint for validating WhatsApp number
routes.get('/api/getSessionInfo/:sessionId', [apikeyMiddleware, sessionNameValidationMiddleware, sessionValidationMiddleware], async (req, res) => {
  try {
    const client = sessions.get(req.params.sessionId)
    const sessionInfo = await client.info
    res.json({ success: true, sessionInfo })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
})

// API endpoint for validating WhatsApp number
routes.post('/api/isRegisteredUser/:sessionId', [apikeyMiddleware, sessionNameValidationMiddleware, sessionValidationMiddleware], async (req, res) => {
  try {
    const { id } = req.body
    const client = sessions.get(req.params.sessionId)
    const isRegisteredUser = await client.isRegisteredUser(id)
    res.json({ success: true, valid: isRegisteredUser })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
})

// API endpoint for creating group
routes.post('/api/createGroup/:sessionId', [apikeyMiddleware, sessionNameValidationMiddleware, sessionValidationMiddleware], async (req, res) => {
  try {
    const { name, participants } = req.body
    const client = sessions.get(req.params.sessionId)
    const response = await client.createGroup(name, participants)
    res.json({ success: true, response })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
})

// API endpoint to set Status
routes.post('/api/setStatus/:sessionId', [apikeyMiddleware, sessionNameValidationMiddleware, sessionValidationMiddleware], async (req, res) => {
  try {
    const { status } = req.body
    const client = sessions.get(req.params.sessionId)
    await client.setStatus(status)
    res.json({ success: true })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
})

// API endpoint for getting contacts
routes.get('/api/getContacts/:sessionId', [apikeyMiddleware, sessionNameValidationMiddleware, sessionValidationMiddleware], async (req, res) => {
  try {
    const client = sessions.get(req.params.sessionId)
    const contacts = await client.getContacts()
    res.json({ success: true, contacts })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
})

// API endpoint for getting chats
routes.get('/api/getChats/:sessionId', [apikeyMiddleware, sessionNameValidationMiddleware, sessionValidationMiddleware], async (req, res) => {
  try {
    const client = sessions.get(req.params.sessionId)
    const chats = await client.getChats()
    res.json({ success: true, chats })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
})

// API endpoint for getting profile picture
routes.post('/api/getProfilePicUrl/:sessionId', [apikeyMiddleware, sessionNameValidationMiddleware, sessionValidationMiddleware], async (req, res) => {
  try {
    const { contactId } = req.body
    const client = sessions.get(req.params.sessionId)
    const profilePicUrl = await client.getProfilePicUrl(contactId)
    res.json({ success: true, profilePicUrl })
  } catch (error) {
    sendErrorResponse(res, 500, error.message)
  }
})

// API endpoint for logging out
routes.get('/api/terminateSession/:sessionId', [apikeyMiddleware, sessionNameValidationMiddleware], async (req, res) => {
  try {
    const sessionId = req.params.sessionId
    const validation = await validateSession(sessionId)
    await deleteSession(sessionId, validation)
    res.json({ success: true, message: 'Logged out successfully' })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// API endpoint for flushing all non-connected sessions
routes.get('/api/terminateInactiveSessions', apikeyMiddleware, async (req, res) => {
  try {
    await flushSessions(true)
    res.json({ success: true, message: 'Flush completed successfully' })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
})

// API endpoint for flushing all sessions
routes.get('/api/terminateAllSessions', apikeyMiddleware, async (req, res) => {
  try {
    await flushSessions(false)
    res.json({ success: true, message: 'Flush completed successfully' })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message })
  }
})

module.exports = { routes }