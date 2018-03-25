
const EventEmitter = require('events').EventEmitter
const _ = require('lodash')

class EventBus extends EventEmitter {

    constructor() {
        super()
        this.subscribers = {}
        this._handlers = {}
        
        this.topic('/subscribe', this.onSubscribe.bind(this))
    }
    
    onSubscribe(){
        return false
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
    let eb = new EventBus()

    eb.topic('db_update', {subdomain:'users', subjects: []}, () => {
        console.log('happend')
    })

    eb.emit('')
}