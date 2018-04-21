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
        this.viewPath = opts.viewPath
        this._staticPaths = null
        this._viewPaths = null
        this._middleware = opts.middleware || []
    }

    get staticPaths() {
        if (!this._staticPaths) this._staticPaths = _.compact([this.staticPath])
        return this._staticPaths
    }

    get viewPaths() {
        if (!this._viewPaths) this._viewPaths = [path.join(process.cwd(), './views')]
        return this._viewPaths
    }

    static setViewEngine(httpHandler) {
        require('./templating')(httpHandler, 'ejs')
        httpHandler.set('view engine', 'ejs')
    }

    middleware() {
        if (!_.isEmpty(this._middleware)) {
            return this._middleware
        }

        //let numDirs = this.staticPaths.length
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

    }

    setupBasicMiddleware() {
        let app = this.messageHandlers.http

        // catch 404 and forward to error handler
        app.use((req, res, next) => {
            if (res.headersSent) return

            let err = this.onNotFound(req)
            next(err)
        })

        // error handler
        app.use((err, req, res, next) => {
            console.error(`[${this.constructor.name}#onError] (headerSent=${res.headersSent})`)

            let locals = this.onError(err, req)
            _.merge(res.locals, locals)

            // render the error page
            res.status(err.status || 500)
            res.render('error', (err, html) => {
                console.error(`[${this.constructor.name}] template render error (headerSent=${res.headersSent}):`, err)

                if (res.headersSent) return

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
            this.setupBasicMiddleware()
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
        let httpAll = opts.httpAll || null
        let appName = opts.name || ''
        let app = express()

        let label = appName && `[${appName}] ` || ''
        this.setViewEngine(app)

        if (opts.viewPaths) app.set('views', opts.viewPaths)

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

        if (httpAll) {
            app.all('*', httpAll)
        }

        return app
    }

    onMessage(topic, req, messageSource) {
        switch (topic) {
            case '/subscribe':
                return this.messageHandlers.ws.onSubscribe(req, messageSource)
            case '/api':
                return this.onApiLocation(req, messageSource)
            case '/template':
                return this.onTemplate(req.name)
            case '/stack':
                return this.onStack(req)
        }
    }

    onStack(req) {
        return {send: `<pre>${require('./utils').stackPrinter(req.app).join('\n')}</pre>`}
    }

    onTemplate(name) {
        return new Promise((resolve, reject) => {
            require('fs').readFile(path.join(this.viewPath, name), 'utf8', (err, txt) => {
                if (err) return reject(err)
                resolve(txt)
            })
        })
    }

    static supportedTopics() {
        return ['/subscribe', '/api', '/template', '/stack']
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

            let data = request.msg.data || {}
            let parsed = url.parse(request.msg.topic, true)
            let topic = parsed.pathname
            request = _.extend(request, parsed.query, data)

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
                res = unboundMeth.apply(this, [parsed.pathname, request, 'WEB_SOCKET'])
            }

            let resPromise = (res instanceof Promise ? res : Promise.resolve(res))

            resPromise
                .catch((err) => {
                    return err
                })
                .then((updates) => {
                    let response = {
                        topic: request.topic,
                        data: updates,
                        type: request.format || 'utf8',
                        handler: this.constructor.name
                    }

                    if(updates instanceof Error){
                        console.error(`[${this.constructor.name}]WebsocketError:`, updates)
                        delete response['data']
                        response.error = updates
                    }

                    messageHandler.respond(conn, response)
                })
        })

        wsHandler.on('closed_connection', (connection) => {
            console.log(`[${this.constructor.name}] ${new Date()} Peer ${connection.remoteAddress} disconnected.`)
        })

        let httpMessageHandler = (req, res, next) => {
            let routes = req.app._router.stack.filter(r => r.route).map(r => r.route)
            let paths = routes.map((r) => r.path)

            if (_.includes(paths, req.path)) {
                console.log(`[${this.constructor.name}] aborting message routing for: path=%s, method=%s`, req.path, req.method)
                return next()
            }

            let topic = req.path
            let unboundMeth = EventBus.polymorphicFn(this.constructor, this.onMessage.name, topic)

            let response = {}
            if (!unboundMeth) {
                next()
            } else {
                let src = `HTTP/${req.method.toUpperCase()}`
                response = unboundMeth.apply(this, [topic, req, src])
            }

            let resPromise = (response instanceof Promise ? response : Promise.resolve(response))

            resPromise.then((updates) => {
                if ('render' in updates) {
                    return _.isArray(updates.render) ? res.render(...updates.render) : res.render(updates.render)
                } else if ('send' in updates) {
                    return res.send(updates.send)
                } else if ('json' in updates) {
                    return res.json(updates.json)
                } else {
                    next()
                }
            })
        }

        let opts = {
            name: this.constructor.name,
            staticPath: this.staticPath,
            middleware: this.middleware(),
            viewPaths: this.viewPaths,
            routers: this.routers(),
            httpAll: httpMessageHandler
        }
        //console.log(`[${this.constructor.name}] http app options:`, opts)
        let httpHandler = this.constructor.createHttpHandler(opts)

        this._msgHandlers = {ws: wsHandler, http: httpHandler}

        this.onCreatedMsgHandler(wsHandler, 'WEB_SOCKET')
        this.onCreatedMsgHandler(httpHandler, 'HTTP')

        return this._msgHandlers
    }

    onCreatedMsgHandler(handler, handlerType) {

    }

    routers() {
        return {
            '/dist': express.static(path.join(__dirname, '../dist'), {fallthrough: false}),
            //'/component': express.static(path.join(__dirname, '../src/component'), {fallthrough: false})
        }
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
        this._models = null
    }

    onApiSheet(req) {
        //return this.apiSheet
        return libDb.schema()
    }

    static supportedTopics() {
        return ['/as', '/']
    }

    onMessage(topic, req) {
        switch (topic) {
            case '/as':
                return this.onApiSheet(req)
            case '/':
                return {send: `${this.constructor.name} is up!`}
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
        opts = opts || {}
        this._staticPaths = _.compact([this.staticPath, path.join(__dirname, '../src/assets')])
        this._viewPaths = [opts.viewPath || path.join(process.cwd(), './views'), path.join(__dirname, '../views')]
    }

    static supportedTopics() {
        return ['/']
    }

    onMessage(topic, req) {
        switch (topic) {
            case '/':
                return {render: [path.join(__dirname, '../views/index.ejs')]}
        }
    }

}

module.exports = {CrudSession, AdministerSession, SessionHandler}