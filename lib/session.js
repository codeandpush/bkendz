/**
 * Created by anthony on 25/03/2018.
 */
const EventBus = require('./eventbus')
const _ = require('lodash')
const express = require('express')
const Promise = require('bluebird')
const url = require('url')
const http = require('http')
const {WsMessageHandler} = require('./ws')
const {createHttp} = require('./http')
const WebSocketServer = require('websocket').server

const path = require('path')
const logger = require('morgan')
const cookieParser = require('cookie-parser')
const bodyParser = require('body-parser')
const assert = require('assert')

const utils = require('./utils')
const libDb = require('./db')

class SessionHandler extends EventBus {
    
    constructor(options) {
        super()
        let opts = options || {}
        this.role = opts.role
        this.staticPath = opts.staticPath
        this._staticPaths = null
        this._middleware = opts.middleware || []
    }
    
    get staticPaths() {
        if (!this._staticPaths) return this._staticPaths = _.compact([this.staticPath])
        return this._staticPaths
    }
    
    static setViewEngine(httpHandler) {
        require('./templating')(httpHandler, 'ejs')
        httpHandler.set('view engine', 'ejs')
    }
    
    get middleware() {
        if (!_.isEmpty(this._middleware)) {
            return this._middleware
        }
        
        _.each(this.staticPaths, (staticPath, index) => {
            //let isLast = index === (this.staticPaths.length - 1)
            console.log(`[${this.constructor.name}] adding static path '${staticPath}'`)
            this._middleware.push(express.static(staticPath, {fallthrough: true}))
        })
        
        return this._middleware
    }
    
    static originIsAllowed(origin) {
        // put logic here to detect whether the specified origin is allowed.
        return true;
    }
    
    static apiLocation() {
        let location = {}
        _.each(['ws', 'wss', 'http', 'https'], (protocol) => {
            location[protocol] = `${protocol}:${this.DEFAULT_API_URL}`
        })
        return location
    }
    
    onApiLocation(req) {
        return this.constructor.apiLocation()
    }
    
    onNotFound(req) {
        const err = new Error(`[${this.constructor.name}] Not Found`)
        err.status = 404
        return err
    }
    
    onError(error, req) {
        // set locals, only providing error in development
        return {error: req.app.get('env') === 'development' ? error : {}, message: error.message}
    }
    
    onListening(server) {
        console.log(`[${this.constructor.name}] listening on port`, server.address().port)
        this.setupBasicMiddleware()
    }
    
    setupBasicMiddleware() {
        let app = this.messageHandlers.http
        
        // catch 404 and forward to error handler
        app.use((req, res, next) => {
            let err = this.onNotFound(req)
            next(err)
        })
        
        // error handler
        app.use((err, req, res, next) => {
            let locals = this.onError(err, req)
            _.merge(res.locals, locals)
            
            // render the error page
            res.status(err.status || 500)
            res.render('error', function (err, html) {
                let htmls = _.compact([res.locals.error, err]).map((error) => {
                    let message = res.locals.message || ''
                    return `<h1>${message}</h1>
<h2>${error.status}</h2>
<pre>${error.stack}</pre>`
                })
                res.send(htmls.join('<br/>'))
            })
            console.error(`[${this.constructor.name}] ${req.method.toUpperCase()} "${req.path}" - `, err.toString())
        })
    }
    
    get servers() {
        if (this._servers) return this._servers
        let server = http.createServer(this.messageHandlers.http)
        
        server.once('listening', () => {
            this.onListening(server)
            this.emit('listening', server)
        })
        
        let wsServer = new WebSocketServer({httpServer: server, autoAcceptConnections: false})
        wsServer.on('request', this.wsRequestHandler.bind(this))
        this._servers = {
            ws: wsServer,
            http: server
        }
        return this._servers
    }
    
    onPrefChanged() {
    
    }
    
    service() {
    
    }
    
    static createHttpHandler(opts) {
        opts = opts || {}
        let routers = opts.routers || {}
        let middleware = opts.middleware || []
        let appName = opts.name || ''
        let app = express()
        
        let label = appName && `[${appName}] ` || ''
        this.setViewEngine(app)
        app.use(logger(`${label}":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"`))
        app.use(bodyParser.json())
        app.use(bodyParser.urlencoded({extended: false}))
        app.use(cookieParser())
        
        //console.log(`[${this.name}#createHttp] middleware=${middleware.length}, staticPath=${staticPath}`)
        
        _.each(middleware, (mw) => {
            app.use(mw)
        })
        
        _.each(routers, (router, refPattern) => {
            app.use(refPattern, router)
        })
        
        return app
    }
    
    onMessage(topic, ...args) {
        switch (topic) {
            case '/subscribe':
                return this.messageHandlers.ws.onSubscribe(...args)
            case '/api':
                return this.onApiLocation(...args)
        }
    }
    
    static supportedTopics() {
        return ['/subscribe', '/api']
    }
    
    get messageHandlers() {
        if (this._msgHandlers) return this._msgHandlers
        let wsHandler = new WsMessageHandler()
        
        wsHandler.on('request', (messageHandler, conn, message) => {
            
            let request = {
                msg: JSON.parse(message.utf8Data),
                type: message.type,
                raw: message
            }
            
            let parsed = url.parse(request.msg.topic, true)
            let topic = parsed.pathname
            request = _.extend(request, parsed.query)
            
            request.topic = request.msg.topic
            request.conn = conn
            
            let res = null
            
            let unboundMeth = EventBus.polymorphicFn(this.constructor, this.onMessage.name, topic)
            //console.log(`[${this.constructor.name}] topic func (${topic}): ${unboundMeth}`)
            
            if (!unboundMeth) {
                console.error(`[${this.constructor.name}] unsupported topic: ${topic}`)
                res = this.onNotFound(request)
            } else {
                //console.error(`[${this.constructor.name}] calling handler`)
                res = unboundMeth.apply(this, [parsed.pathname, request])
            }
            
            let resPromise = (res instanceof Promise ? res : Promise.resolve(res))
            
            resPromise.then((updates) => {
                let response = {
                    topic: request.topic,
                    data: _.isObject(updates) ? _.merge({}, updates) : updates,
                    type: 'utf8'
                }
                messageHandler.respond(conn, response)
            })
        })
        
        wsHandler.on('closed_connection', (connection) => {
            console.log(`[${this.constructor.name}] ${new Date()} Peer ${connection.remoteAddress} disconnected.`)
        })
        
        let opts = {
            name: this.constructor.name,
            staticPath: this.staticPath,
            middleware: this.middleware,
            routers: {
                '/api': (req, res) => {
                    let location = this.onApiLocation(req)
                    res.json(location)
                }
            }
        }
        let httpHandler = this.constructor.createHttpHandler(opts)
        
        this._msgHandlers = {ws: wsHandler, http: httpHandler}
        return this._msgHandlers
    }
    
    wsRequestHandler(request) {
        if (this.constructor.originIsAllowed(request.origin)) {
            const connection = request.accept('echo-protocol', request.origin)
            
            connection._resourceURL = request.resourceURL
            console.log(`[${this.constructor.name}] ${(new Date())} Connection accepted.`)
            this.messageHandlers.ws.addConnection(connection)
        } else {
            request.reject()
            console.log(`[${this.constructor.name}] ${(new Date())} Connection from origin ${request.origin} rejected.`)
        }
    }
    
}

SessionHandler.DEFAULT_API_URL = '//localhost:9001'

class CrudSession extends SessionHandler {
    
    constructor(options) {
        super(options)
        let opts = options || {}
        this.apiSheet = opts.apiSheet
        this.staticPath = opts.staticPath
        this.initEndpoints()
        
        this.messageHandlers.http.get('/', (req, res) => {
            res.send(`${this.constructor.name} is up!`)
        })
        this._models = null
    }
    
    onApiSheet(req) {
        //return this.apiSheet
        return libDb.schema()
    }
    
    static supportedTopics() {
        return ['/as']
    }
    
    onMessage(topic, req) {
        switch (topic) {
            case '/as':
                return this.onApiSheet(req)
        }
    }
    
    create() {
    
    }
    
    update() {
    
    }
    
    get models() {
        if (!this._models) this._models = require(require('./utils').getRcConf()['models-path']).sequelize.models
        return this._models
    }
    
    initEndpoints() {
        let apiSheet = this.apiSheet
        if (this.apiSheet) console.log(`[${this.constructor.name}] initialising API endpoints...`, this.apiSheet)
    }
    
}

class AdministerSession extends SessionHandler {
    
    constructor(opts) {
        super(opts)
        this._staticPaths = _.compact([this.staticPath, path.join(__dirname, '../src')])
    }
    
}

module.exports = {CrudSession, AdministerSession, SessionHandler}