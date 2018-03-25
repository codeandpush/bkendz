/**
 * Created by anthony on 25/03/2018.
 */
const http = require('http')
const WebSocketServer = require('websocket').server
const _ = require('lodash')

// Serve up public/ftp folder
const express = require('express')
const path = require('path')
const logger = require('morgan')
const cookieParser = require('cookie-parser')
const bodyParser = require('body-parser')

function createHttp(opts) {
    opts = opts || {}
    let routers = opts.routers || {}
    let appName = opts.name || ''
    let app = express()
    
    let label = appName && `[${appName}] ` || ''
    app.set('view engine', 'ejs')
    app.use(logger(`${label}":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"`))
    app.use(bodyParser.json())
    app.use(bodyParser.urlencoded({extended: false}))
    app.use(cookieParser())
    
    _.each(routers, (router, refPattern) => {
        app.use(refPattern, router)
    })
    
    let staticPath = path.join(__dirname, '../src')
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
        console.error(err)
    })
    
    const server = http.createServer(app)
    
    const wsServer = new WebSocketServer({httpServer: server, autoAcceptConnections: false})
    return {app, server, wsServer}
}
// Listen

module.exports = {createHttp}

if (require.main === module) {
    const port = process.env.PORT || 26116
    console.log(`starting monitoring server on ${port}...`)
    server.listen(port)
}