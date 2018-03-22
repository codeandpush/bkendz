/**
 * Created by anthony on 02/02/2018.
 */

const http = require('http')
const WebSocketServer = require('websocket').server;
const messageHandler = require('./message_handler')
const _ = require('lodash');

// Serve up public/ftp folder
const express = require('express');
const path = require('path');
const logger = require('morgan');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');

const app = express()

app.set('view engine', 'ejs')
app.use(logger('":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(cookieParser());

app.use('/', messageHandler.routeHandler)

app.use(express.static(path.join(__dirname, './src')))

// catch 404 and forward to error handler
app.use(function (req, res, next) {
    const err = new Error('Not Found');
    err.status = 404;
    next(err);
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
// Listen

module.exports = {app, server}

if (require.main === module) {
    const port = process.env.PORT || 26116
    console.log(`starting monitoring server on ${port}...`)
    server.listen(port)
}

const wsServer = new WebSocketServer({httpServer: server, autoAcceptConnections: false});

function originIsAllowed(origin) {
    // put logic here to detect whether the specified origin is allowed.
    return true;
}

wsServer.on('request', function (request) {
    if (!originIsAllowed(request.origin)) {
        // Make sure we only accept requests from an allowed origin
        request.reject();
        console.log((new Date()) + ' Connection from origin ' + request.origin + ' rejected.');
        return;
    }
    console.dir('websocket:', request)
    
    const connection = request.accept('echo-protocol', request.origin);
    
    connection._resourceURL = request.resourceURL
    console.log((new Date()) + ' Connection accepted.');
    
    const handleMessage = _.partial(messageHandler.wsHandler.handleMessage, connection).bind(messageHandler.wsHandler)
    connection.on('message', handleMessage)
    
    connection.on('close', function(reasonCode, description){
        messageHandler.wsHandler.onClose(this, reasonCode, description)
    })
    
})