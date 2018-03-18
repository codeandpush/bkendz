/**
 * Created by anthony on 02/02/2018.
 */
const express = require('express')
const _ = require('lodash')
const EventEmitter = require('events').EventEmitter
const Promise = require('bluebird')

class WebSocketHandler extends EventEmitter {
    
    constructor() {
        super()
        this.subscribers = {}
    }
    
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
        
        if (!handler) return {data: 404, type: 'utf8'}
        
        let resp = handler(connection, _.extend({$msg: msg}, parsed.query))
        
        return (Promise.is(resp) ? resp : Promise.resolve(resp))
            .then((resp) => {
                
                if (_.isString(resp)) {
                    resp = {type: 'utf8', data: resp}
                } else if (!('type' in resp)) {
                    resp['type'] = 'utf8'
                }
    
                switch(resp.type){
                    case 'utf8':
                        let dataStr = resp.data
            
                        if (!_.isString(dataStr)) {
                            dataStr = JSON.stringify(dataStr);
                        }
    
                        connection.sendUTF(dataStr, (error) => {
                            if (error) {
                                console.error(error)
                            } else {
                                console.log('message sent:', resp.data)
                            }
                        })
                        break;
                    case 'binary':
                        connection.sendBytes(resp.binaryData);
                        break;
                    default:
                        throw Error(`unknown response data type ${resp.dataType}`)
                }
                return true
            })
    }
    
    topic(label, callback) {
        this.handlers[label] = callback
    }
    
    onClose(connection, reasonCode, description) {
        console.log((new Date()) + ' Peer ' + connection.remoteAddress + ' disconnected.')
        for (let [sub, conns] of _.toPairs(this.subscribers)) {
            console.log('[onClose]', sub, ':', _.includes(conns, connection))
            _.remove(conns, connection)
        }
    }
    
    addSubscription(subject, conn) {
        let subs = this.subscribers[subject] = this.subscribers[subject] || []
        subs.push(conn)
        console.log('[addSubscription] ', subject)
        wsHandler.emit('subscription_added', subject, conn)
    }
    
    get handlers() {
        return this.constructor.HANDLERS
    }
}

WebSocketHandler.HANDLERS = {}

const wsHandler = new WebSocketHandler()

wsHandler.topic('/subscribe', (conn, msg) => {
    
    wsHandler.addSubscription(msg.subject, conn)
    
    return {data: {subscribed: msg.subject || null}}
})


const routeHandler = new express.Router()

routeHandler.get('/', (req, res) => {
    res.render('index')
})

module.exports = {wsHandler, routeHandler}