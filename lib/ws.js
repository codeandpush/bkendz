/**
 * Created by anthony on 26/03/2018.
 */
const EventBus = require('./eventbus')
const _ = require('lodash')
const express = require('express')
const url = require('url')
const Promise = require('bluebird')

class WsMessageHandler extends EventBus {
    
    constructor() {
        super()
        this.connections = []
    }
    
    respond(connection, response) {
        return Promise.resolve(response)
            .then((resp) => {
                return connection.send(resp.topic, resp)
            })
    }
    
    addConnection(connection) {
        connection.send = function (topic, resp) {
            
            switch (resp.type) {
                case 'utf8':
                    let dataStr = resp
                    
                    if (_.isObject(dataStr) && topic && !('topic' in dataStr)) {
                        dataStr.topic = topic
                    }
                    
                    if (!_.isString(dataStr)) {
                        try{
                            dataStr = JSON.stringify(dataStr);
                        }catch (error){
                            console.error('[connection#send] bad response:', dataStr)
                            dataStr = JSON.stringify({topic, error: {code: 501, msg: 'failed to serialize response'}})
                        }
                       
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
                this.emit('request', this, connection, ...args)
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
        for (let conns of Object.values(this.subscribers)) {
            _.remove(conns, connection)
        }
        this.emit('closed_connection', connection, reasonCode, description)
    }
    
    onSubscribe(msg) {
        let conn = msg.conn
        //console.log(`[${this.constructor.name}] subscribe:`, msg)
        this.addSubscription(msg.subject, conn)
        return {subscribed: msg.subject || null}
    }
    
}

module.exports = {WsMessageHandler}
