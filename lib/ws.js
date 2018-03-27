/**
 * Created by anthony on 26/03/2018.
 */
const EventBus = require('./eventbus')
const _ = require('lodash')
const express = require('express')
const url = require('url')
const Promise = require('bluebird')

class WsMessageHandler extends EventBus {
    
    constructor(){
        super()
        this.connections = []
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
    
    addConnection(connection){
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
    
        connection.on('message', (...args) => {
        
            try {
                this.handleMessage(connection, ...args)
                    .then((res) => {
                        this.emit('request', this, res, connection)
                    })
            } catch (error) {
                console.error(error)
            }
        })
    
        connection.on('close', (reasonCode, description) => {
            this.onClose(connection, reasonCode, description)
        })
        
        this.connections.push(connection)
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

module.exports = {WsMessageHandler}
