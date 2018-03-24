/**
 * Created by anthony on 02/02/2018.
 */
const express = require('express')
const _ = require('lodash')
const EventBus = require('./lib').EventBus
const Promise = require('bluebird')
const url = require('url')

class WebSocketHandler extends EventBus {

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
        console.log((new Date()) + ' Peer ' + connection.remoteAddress + ' disconnected.')
        for (let [sub, conns] of _.toPairs(this.subscribers)) {
            console.log('[onClose]', sub, ':', _.includes(conns, connection))
            _.remove(conns, connection)
        }
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