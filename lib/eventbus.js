
const EventEmitter = require('events').EventEmitter
const _ = require('lodash')
const utils = require('./utils')

class UnsupportedTopicException extends Error {

}

class EventBus extends EventEmitter {

    constructor() {
        super()
        this.subscribers = {}
        this._handlers = {}
    }
    
    onSubscribe(){
        return false
    }
    
    static supportedTopics(){
        return ['/echo', '/subscribe']
    }
    
    static polymorphicFn(cls, methodName, topic){
        //console.dir()
        if(!_.isFunction(cls, 'supportedTopics')) return null
        
        const supportsTopic = (c, t) => {
            return _.includes(Object.getOwnPropertyNames(c), 'supportedTopics') && _.includes(c.supportedTopics(), t)
        }
        
        if(supportsTopic(cls, topic)){
            return cls.prototype[methodName]
        }
        
        let suprList = utils.getSuperClasses(cls, EventBus.name)
        let clsChain = _.concat(suprList, [EventBus])
        
        for(let supr of clsChain){
            if(supportsTopic(supr, topic)){
                return supr.prototype[methodName]
            }
        }
        
        return null
    }
    
    onMessage(topic, ...args){
        console.log('[EventBus] handing topic:', topic)
        switch (topic){
            case '/echo':
                return {data: args}
            case '/subscribe':
                console.log('[EventBus] constructor:', this.constructor.name)
                return this.constructor.prototype[this.onSubscribe.name].apply(this, args)
        }
    }

    topic(label, callbackOrOptions, callbackOrNone) {
        let [computedLabel, cb] = (function (rawLabel, options, callback) {
                    //
                    if (options.subdomain){
                        rawLabel = `${options.subdomain}${ _.startsWith('/') ? '' : '/'}${rawLabel}`
                    }
                    return [rawLabel, callback]
                })(label,
                    _.isFunction(callbackOrNone) ? callbackOrOptions : {},
                    _.isFunction(callbackOrNone) ? callbackOrNone : callbackOrOptions)

        this.handlers[computedLabel] = cb
    }

    addSubscription(subject, options) {
        let subs = this.subscribers[subject] = this.subscribers[subject] || []
        subs.push(options)
        console.log('[addSubscription] ', subject)
        
        setTimeout(() => this.emit('subscription_added', subject, options), 0)
    }

    get handlers() {
        return this._handlers
    }

}

module.exports = EventBus

if(require.main === module){
    
    class ShadowBus extends EventBus {
        
        static supportedTopics(){
            return ['/hi']
        }
        
        onMessage(topic){
            switch (topic){
                case '/hi':
                    return {data: 'hello'}
                    break
            }
        }
    }
    
    class LightBus extends ShadowBus {
        
        static supportedTopics(){
            return ['/hey', '/hi']
        }
        
        onMessage(topic){
            switch (topic){
                case '/hey':
                    return {data: 'hey!'}
                    break
                case '/hi':
                    return {data: 'override'}
            }
        }
    }
    
    let eb = new LightBus()

    let res = EventBus.polymorphicFn(eb.constructor, 'onMessage', '/hi').apply(eb, ['/hi', {}])
    console.log('Result:', res)
}