/**
 * Created by anthony on 25/03/2018.
 */
const http = require('http')
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
    console.log(`[createHttp] middleware=${middleware.length}, staticPath=${staticPath}`)
    
    _.each(middleware, (mw) => {
        app.use(mw)
    })
    
    _.each(routers, (router, refPattern) => {
        app.use(refPattern, router)
    })
    
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
        console.error(`${req.method.toUpperCase()} "${req.path}" error:`, err)
    })
    
    
    return app
}
// Listen

module.exports = {createHttp}