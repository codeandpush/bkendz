/**
 * Created by anthony on 25/03/2018.
 */
const EventBus = require('./eventbus')
const _ = require('lodash')
const express = require('express')
const Promise = require('bluebird')
const url = require('url')

class WsMessageHandler extends EventBus {
    
    handleMessage(connection, message) {
        message = {
            msg: JSON.parse(message.utf8Data),
            type: message.type,
            raw: message
        }
        let msg = message.msg
        
        console.log('Received Message: ', msg)
        
        let parsed = url.parse(msg.topic, true)
        let handler = this.handlers[parsed.pathname]
        
        let response = handler ? handler(connection, _.extend({$msg: msg}, parsed.query)) : {data: 404, type: 'utf8', error: true}
        
        return (Promise.is(response) ? response : Promise.resolve(response))
            .then((resp) => {
                
                if (_.isString(resp)) {
                    resp = {type: 'utf8', data: resp}
                }
                
                if (!('type' in resp)) {
                    resp['type'] = 'utf8'
                }
                
                if (!('topic' in resp)) {
                    resp.topic = msg.topic
                }
                
                return resp
            })
    }
    
    respond(connection, response) {
        return Promise.resolve(response)
            .then((resp) => {
                return connection.send(resp.topic, resp)
            })
    }
    
    onClose(connection, reasonCode, description) {
        console.log(`${new Date()} Peer ${connection.remoteAddress} disconnected.`)
        for (let [sub, conns] of _.toPairs(this.subscribers)) {
            console.log('[onClose]', sub, ':', _.includes(conns, connection))
            _.remove(conns, connection)
        }
    }
    
    onSubscribe(conn, msg){
        this.addSubscription(msg.subject, conn)
        return {data: {subscribed: msg.subject || null}}
    }
    
}

class SessionHandler extends EventBus {
    
    constructor(role){
        super()
        this.role = role
        this._connections = []
    }
    
    static originIsAllowed(origin) {
        // put logic here to detect whether the specified origin is allowed.
        return true;
    }
    
    makeServers(){
        let opts = {routers:{'/': this.messageHandlers.http}, name: this.constructor.name}
        let {app, server, wsServer} = require('./http').createHttp(opts)
        wsServer.on('request', this.wsRequestHandler.bind(this))
        return {
            ws: {wsServer, handler: this.messageHandlers.ws},
            http: {server, handler: this.messageHandlers.http, app}
        }
    }
    
    onPrefChanged(){
    
    }
    
    service(){
    
    }
    
    get messageHandlers(){
        if(this._msgHandlers) return this._msgHandlers
        this._msgHandlers = {ws: new WsMessageHandler(), http: new express.Router()}
        return this._msgHandlers
    }
    
    get connections(){
        return this._connections
    }
    
    wsRequestHandler(request){
        if (!this.constructor.originIsAllowed(request.origin)) {
            // Make sure we only accept requests from an allowed origin
            request.reject()
            console.log((new Date()) + ' Connection from origin ' + request.origin + ' rejected.')
            return
        }
    
        const connection = request.accept('echo-protocol', request.origin)
        this._connections.push(connection)
        
        connection._resourceURL = request.resourceURL
        console.log((new Date()) + ' Connection accepted.')
    
        connection.send = function (topic, resp) {
            switch (resp.type) {
                case 'utf8':
                    let dataStr = resp
                
                    if (_.isObject(dataStr) && topic && !('topic' in dataStr)) {
                        dataStr.topic = topic
                    }
                
                    if (!_.isString(dataStr)) {
                        dataStr = JSON.stringify(dataStr);
                    }
                
                    this.sendUTF(dataStr, (error) => {
                        if (error) {
                            console.error(error)
                        } else {
                            console.log('message sent:', dataStr.slice(0, 100))
                        }
                    })
                    break;
                case 'binary':
                    this.sendBytes(resp.binaryData);
                    break;
                default:
                    throw Error(`unknown response data type ${resp.dataType}`)
            }
        }
    
        const wsHandler = this.messageHandlers.ws
    
        const handleMessage = _.partial(wsHandler.handleMessage, connection).bind(wsHandler)
        connection.on('message', (...args) => {
        
            try {
                handleMessage(...args)
                    .then((res) => {
                        this.emit('request', wsHandler, res, connection)
                    })
            } catch (error) {
                console.error(error)
            }
        })
    
        connection.on('close', (reasonCode, description) => {
            wsHandler.onClose(connection, reasonCode, description)
        })
    }
    
}

SessionHandler.ROLE_CUSTOMER = 'Customer'
SessionHandler.ROLE_EMPLOYEE = 'Staff'

class CrudSession extends SessionHandler {
    
    constructor(options){
        super()
        this.apiSheet = (options || {}).apiSheet
        this.initEndpoints()
    
        this.messageHandlers.http.get('/', (req, res) => {
            res.send(`${this.constructor.name} is up!`)
        })
    }
    
    create(){
    
    }
    
    update(){
    
    }
    
    //noinspection JSMethodCanBeStatic
    get models(){
        return require(require('./utils').getRcConf()['models-path'])
    }
    
    initEndpoints(){
        let apiSheet = this.apiSheet
        console.log('[CrudSession] initialising API endpoints...', this.apiSheet)
        
        let User = this.models.User
        _.each(apiSheet['User'].requests, (reqPattern, ref) => {
            switch (ref.toLowerCase()){
                case 'index':
                    
                    this.messageHandlers.http.get('/users', (req, res) => {
                        return User.findAll().then((users) => {
                            res.json(users.map(u => u.toJson()))
                        })
                    })
                    
                    break
                case 'create':
                    break
            }
        })
    }
    
}

class AdministerSession extends SessionHandler {
    
    constructor(){
        super()
    
        this.messageHandlers.http.get('/', (req, res) => {
        
            let tabs = []
            let schema = require('./db').schema()
            _.each(schema, function(def, clsName) {
                tabs.push({label: clsName, content: `Hello ${clsName}`})
            })
        
            res.render('index', {tabs, defaultTab: 'user', schemaJson: JSON.stringify(schema, null, 4)})
        })
    }
    
}

module.exports = {CrudSession, AdministerSession, SessionHandler}

function sess(request) {

}