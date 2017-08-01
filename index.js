var AbstractClientStore = require('express-brute/lib/AbstractClientStore'),
    Redis = require('redis'),
    _ = require('underscore'),
    redisScan = require('redisscan');


var RedisStore = module.exports = function (options) {
	AbstractClientStore.apply(this, arguments);
	this.options = _.extend({}, RedisStore.defaults, options);
	this.redisOptions = _(this.options).clone();
	delete this.redisOptions.prefix;
	delete this.redisOptions.client;
	delete this.redisOptions.port;
	delete this.redisOptions.host;

	if (this.options.client) {
		this.client = this.options.client;
	} else {
		this.client = RedisStore.Redis.createClient(
			this.options.port,
			this.options.host,
			this.options.redisOptions
		);
	}
};
RedisStore.prototype = Object.create(AbstractClientStore.prototype);
RedisStore.prototype.set = function (key, value, lifetime, callback) {
	lifetime = parseInt(lifetime, 10) || 0;
	var multi    = this.client.multi(),
	    redisKey = this.options.prefix+key;

	multi.set(redisKey, JSON.stringify(value));
	if (lifetime > 0) {
		multi.expire(redisKey, lifetime);
	}
	multi.exec(function (err, data) {
		typeof callback == 'function' && callback.call(this, null);
	});
};

RedisStore.prototype.getKeys = function (opts, callback) {
  var ret = {};
  redisScan({
      redis: this.client,
      pattern: opts.pattern || '',
      keys_only: opts.keys_only,
      each_callback: function (type, key, subkey, length, value, cb) {
          if (!opts.fnShouldReturn) {
            ret[key] = value;
          } else {
            var v = opts.fnShouldReturn(key, value);
            if (v !== false) ret[key] = v;
          }
          cb();
      },
      done_callback: function (err) {
          if (err) return callback(err);
          callback(null, ret);
      }
  });
};

RedisStore.prototype.getBlAndWlKeys = function (callback) {
  var wl = [], bl = [];
  redisScan({
      redis: this.client,
      pattern: (this.options.prefix || '') + '*',
      keys_only: false,
      each_callback: function (type, key, subkey, length, value, cb) {
          var v = {}
          try {
            v = JSON.parse(value);
          } catch (e) {
            // No problem
          }
          if(v.bl && v.ip) bl.push(v.ip);
          if(v.wl && v.ip) wl.push(v.ip);
          
          cb();
      },
      done_callback: function (err) {
          if (err) return callback(err);
          callback(null, {wl: wl, bl: bl});
      }
  });
};

RedisStore.prototype.get = function (key, callback) {
	this.client.get(this.options.prefix+key, function (err, data) {
		if (err) {
			typeof callback == 'function' && callback(err, null);
		} else {
			if (data) {
				data = JSON.parse(data);
				data.lastRequest = new Date(data.lastRequest);
				data.firstRequest = new Date(data.firstRequest);
			}
			typeof callback == 'function' && callback(err, data);
		}
	});
};
RedisStore.prototype.reset = function (key, callback) {
	this.client.del(this.options.prefix+key, function (err, data) {
		typeof callback == 'function' && callback.apply(this, arguments);
	});
};
RedisStore.Redis = Redis;
RedisStore.defaults = {
	prefix: '',
	port: 6379,
	host: '127.0.0.1'
};
