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

class SessionHandler extends EventBus {
    
    constructor(options) {
        super()
        let opts = options || {}
        this.role = opts.role
        this.staticPath = opts.staticPath
        this.middleware = opts.middleware || []
    }
    
    static originIsAllowed(origin) {
        // put logic here to detect whether the specified origin is allowed.
        return true;
    }
    
    get servers() {
        if(this._servers) return this._servers
        let server = http.createServer(this.messageHandlers.http)
    
        server.once('listening', () => {
            console.log(`[${this.constructor.name}] listening on port`, server.address().port)
            this.messageHandlers.http.setupBasicHandlers()
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
    
    static createHttpHandler(opts){
        opts = opts || {}
        let routers = opts.routers || {}
        let middleware = opts.middleware || []
        let appName = opts.name || ''
        let app = express()
    
        let label = appName && `[${appName}] ` || ''
        app.set('view engine', 'ejs')
        app.use(logger(`${label}":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"`))
        app.use(bodyParser.json())
        app.use(bodyParser.urlencoded({extended: false}))
        app.use(cookieParser())
    
        let staticPath = opts.staticPath || path.join(__dirname, '../src')
        console.log(`[${this.name}#createHttp] middleware=${middleware.length}, staticPath=${staticPath}`)
    
        _.each(middleware, (mw) => {
            app.use(mw)
        })
    
        _.each(routers, (router, refPattern) => {
            app.use(refPattern, router)
        })
        
        app.setupBasicHandlers = function () {
    
            app.use(express.static(staticPath))
            // catch 404 and forward to error handler
            app.use(function (req, res, next) {
                const err = new Error('Not Found')
                err.status = 404
                next(err)
            })
    
            // error handler
            app.use(function (err, req, res, next) {
                // set locals, only providing error in development
                res.locals.message = err.message
                res.locals.error = req.app.get('env') === 'development' ? err : {}
        
                // render the error page
                res.status(err.status || 500)
                res.render('error')
                console.error(`${req.method.toUpperCase()} "${req.path}" - `, err.toString())
            })
        }
        return app
    }
    
    onMessage(messageHandler, request, conn){
        if(this.listenerCount('message') > 0) this.emit('message', messageHandler, request, conn)
        else messageHandler.respond(conn, request)
    }
    
    get messageHandlers() {
        if (this._msgHandlers) return this._msgHandlers
        let wsHandler = new WsMessageHandler()
        
        wsHandler.on('request', (...args) => {
            this.onMessage(...args)
        })
        
        let opts = {
            name: this.constructor.name,
            staticPath: this.staticPath,
            middleware: this.middleware
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
        }else {
            request.reject()
            console.log(`[${this.constructor.name}] ${(new Date())} Connection from origin ${request.origin} rejected.`)
        }
    }
    
}

class CrudSession extends SessionHandler {
    
    constructor(options) {
        super(options)
        let opts = options || {}
        this.apiSheet = opts.apiSheet
        this.staticPath = opts.staticPath
        this.middleware = opts.middleware || []
        this.initEndpoints()
        
        this.messageHandlers.http.get('/', (req, res) => {
            res.send(`${this.constructor.name} is up!`)
        })
    }
    
    create() {
    
    }
    
    update() {
    
    }
    
    //noinspection JSMethodCanBeStatic
    get models() {
        return require(require('./utils').getRcConf()['models-path'])
    }
    
    initEndpoints() {
        let apiSheet = this.apiSheet
        if (this.apiSheet) console.log('[CrudSession] initialising API endpoints...', this.apiSheet)
        
        // let User = this.models.User
        // _.each(apiSheet['User'].requests, (reqPattern, ref) => {
        //     switch (ref.toLowerCase()){
        //         case 'index':
        //
        //             this.messageHandlers.http.get('/users', (req, res) => {
        //                 return User.findAll().then((users) => {
        //                     res.json(users.map(u => u.toJson()))
        //                 })
        //             })
        //
        //             break
        //         case 'create':
        //             break
        //     }
        // })
    }
    
}

class AdministerSession extends SessionHandler {
    
    constructor(opts) {
        super(opts)
        this.staticPath = opts.staticPath
        this.middleware = opts.middleware || []
    }
    
}

module.exports = {CrudSession, AdministerSession, SessionHandler}