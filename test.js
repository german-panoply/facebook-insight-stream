var assert = require( "assert" );
var request = require( "request" );
var sinon = require( "sinon" );
var Promise = require( "bluebird" );
var moment = require('moment')
const queryString = require('querystring')
var FacebookInsightStream = require( "./index" );

var BASEURL = "https://graph.facebook.com/";
var METRICS = require( "./metric-list" );

var req_get = request.get;
let calledUrl

describe( "Skip missing data", function () {
    var result = {};
    var source = {
        apps: [ 'myApp' ],
        ignoreMissing: true
    }
    var _err = { message: 'skip error', code: 100 };
    var response = { "myApp": { error: _err, name: "myApp", data: dataGenerator( 1, null ) } }

    before( initialize( result, response, source ) )
    after( reset )

    it( 'Skip missing data', function () {
        var dataSize = Object.keys( result.data[ 0 ] ).length;
        // the data size should be as the size of
        // metrics + 2 columns ( date, name, id excluding the first metric )
        assert.equal( dataSize, METRICS.length + 2 );
        assert.equal( result.data.length, 1 )
    })
})

describe( "Skip missing item", function () {
    var result = {};
    var source = {
        apps: [ 'myApp' ]
    }
    var _err = { message: 'skip error', code: 3001 };
    var response = { "myApp": { error: _err, name: "myApp", data: dataGenerator( 1, null ) } }

    before( initialize( result, response, source ) )
    after( reset )

    it( 'Skip missing item', function () {
        var dataSize = Object.keys( result.data[ 0 ] ).length;
        // the data size should be as the size of
        // metrics + 2 columns ( date, name, id excluding the first metric )
        assert.equal( dataSize, METRICS.length + 2 );
        assert.equal( result.data.length, 1 )
    })
})

describe( "error", function () {
    var result = {};
    var source = {
        apps: [ "myApp" ],
    }
    var _err = { message: "test error" };
    var response = { "myApp": { error: _err, name: "myApp" } }

    before( initialize( result, response, source ) )
    after( reset )

    it( "sould emit error", function () {
        assert.equal( result.error.message, "test error" )
    })
})

describe( "retry", function () {
    var result = {};
    var source = {
        apps: [ 'myApp' ],
    }
    var _err = { message: 'retryError' };
    var response = { "myApp": { error: _err, name: "myApp", data: dataGenerator( 1, null ) } }

    before( initialize( result, response, source ) )
    after( reset )

    it( 'retry after specified error', function () {
        var dataSize = Object.keys( result.data[ 0 ] ).length;
        // the data size should be as the size of metrics + 3 columns ( date, name, id )
        assert.equal( dataSize, METRICS.length + 3 );
        assert.equal( result.data.length, 1 )
    })
})

describe( "progress", function () {
    var result = {};
    var source = {
        apps: [ "myApp" ],
    };
    var response = { "myApp": { data: dataGenerator( 1, null ), name: "myApp" } }

    before( initialize( result, response, source ) )
    after( reset )

    it( "should emit progress", function () {
        assert.equal( result.progress.total, 1 );
        assert.equal( result.progress.loaded, 1 );
        assert.equal( result.progress.message, "{{remaining}} apps remaining" )

    })
})

describe( "empty metric", function () {
    var result = {};
    var source = {
        apps: [ "myApp" ],
    }

    var response = { "myApp": { data: dataGenerator( 1, "api_calls" ), name: "myApp" } }

    before( initialize( result, response, source ) )
    after( reset )

    it( "should read all the metrics except api_calls", function () {
        var row = result.data[ 0 ];

        assert.equal( row[ "api_call" ], undefined );
        assert.equal( Object.keys( row ).length, 51 );
    })

})

describe( "appName and appId", function () {
    var result = {};
    var source = {
        apps: [ "someId" ],
    }

    var response = { "someId": { data: dataGenerator( 1, null ), name: "myApp" } }

    before( initialize( result, response, source ) )
    after( reset )

    it( "sould add appName and appId to each row", function () {
        var row = result.data[ 0 ];

        assert.equal( row[ "appName" ], "myApp" );
        assert.equal( row[ "appId" ], "someId" );
    })
})

describe( "collect", function () {
    var result = {};
    var source = {
        apps: [ "myApp1", "myApp2" ],
    }

    var response = {
        "myApp1": { data: dataGenerator( 100, null ), name: "myApp1" },
        "myApp2": { data: dataGenerator( 100, null ), name: "myApp2" }
    }

    before( initialize( result, response, source ) )
    after( reset )

    it( "should read 200 rows for two apps", function() {
        assert.equal( result.data.length, 200 );
        assert.equal( result.data[ 0 ].appName, "myApp2" );
        assert.equal( result.data[ 100 ].appName, "myApp1" );
    })
})

describe( "Fetch beginning of time", function () {
    var result = {};
    var source = {
        apps: [ 'myApp' ],
        ignoreMissing: true
    }

    var response = { "myApp": { error: {}, name: "myApp", data: dataGenerator( 1, null ) } }

    before( initialize( result, response, source, true ) )
    after( reset )

    it( 'Fetch insights from beginning of time', function () {
        console.log('calledUrl: ', calledUrl)
        const parts = calledUrl.split('?')
        const parsed = queryString.parse(parts[1])
        console.log('parsed: ', parsed)
        assert.equal(Boolean(parsed.since), false)
    })
})

describe( "Fetch x Days ago", function () {
    var result = {};
    var source = {
        apps: [ 'myApp' ],
        ignoreMissing: true
    }

    var response = { "myApp": { error: {}, name: "myApp", data: dataGenerator( 1, null ) } }

    before( initialize( result, response, source ) )
    after( reset )

    it( 'Fetch insights for past x days', function () {
        const parts = calledUrl.split('?')
        const parsed = queryString.parse(parts[1])
        assert.equal(Boolean(parsed.since), true)
    })
})

describe( 'Multiple access tokens', function () {
    var sandbox = sinon.sandbox.create()
    var source = {
        apps: [{id: 'myApp1', token: 'tok1'}, {id: 'myApp2', token: 'tok2'}],
    }
    var stream;
    var options = {
        pastdays: '30',
        node: 'posts',
        period: 'daily',
        metrics: METRICS,
        itemList: source.apps
    }

    beforeEach(() => {
        stream = new FacebookInsightStream( options )
    })
    afterEach(() => {
        sandbox.restore()
    })

    it( 'init each item with its own token', function(done) {
        let requests = []
        let initItemStub = sandbox.stub(stream, '_initItem').callsFake(item => {
            requests.push(item)
            return Promise.resolve()
        })
        let ds  = []
        stream.on( 'data', d => ds.push(d) )
            .on( 'end', function () {
                let tokens = new Set(requests.map(req => req.token))
                assert.equal(requests.length, tokens.size)
                done()
            })
    })

    it( 'uses item token', function() {
        let token = 'thetoken'
        let calledUrl = null
        sandbox.stub(FacebookInsightStream, 'apiCall').callsFake(url => {
            calledUrl = url
            return Promise.resolve([null,'{"data":{}}']);
        })
        stream.url = 'https://fb.com/v2.10/123?access_token=&agg=oog&foo=bar'
        return stream._collect([], {token: token}, {}, [{}], {since: '', until: ''})
            .then(() => {
                assert(calledUrl.indexOf(token) > -1)
            })
    })

})

describe('Date Ranges', function () {
    let clock;
 

    beforeEach(function () {
        //sets date to Mar 31, 2018 at 00:00
        clock = sinon.useFakeTimers(new Date(2018,2,31).getTime()) 
    });

    afterEach(function() {
        clock.restore()
    })
    
    it('Test dateRanges with pastdays 30', function (){
        let options = {
            pastdays: '30',
        }
        let stream = new FacebookInsightStream( options )
        let dateRanges = stream.dateRanges
        
        let since = moment('2018-03-01').startOf('day')
        let until = moment('2018-03-31').endOf('day')

        dateRange = dateRanges[0]

        assert.equal(dateRange.since, since.unix())
        assert.equal(dateRange.until, until.unix())
    })

    it('Test dateRanges more than 90 days', function (){
        let options = {
            pastdays: '365',
        }
        let stream = new FacebookInsightStream( options )
        let dateRanges = stream.dateRanges
        
        let since = moment('2017-03-31').startOf('day')
        let until = moment('2017-06-29').endOf('day')

        dateRange = dateRanges[0]

        assert.equal(dateRange.since, since.unix())
        assert.equal(dateRange.until, until.unix())

        since = moment('2017-06-30').startOf('day')
        until = moment('2017-09-28').endOf('day')

        dateRange = dateRanges[1]

        assert.equal(dateRange.since, since.unix())
        assert.equal(dateRange.until, until.unix())

        since = moment('2017-09-29').startOf('day')
        until = moment('2017-12-28').endOf('day')

        dateRange = dateRanges[2]

        assert.equal(dateRange.since, since.unix())
        assert.equal(dateRange.until, until.unix())

        since = moment('2017-12-29').startOf('day')
        until = moment('2018-03-29').endOf('day')

        dateRange = dateRanges[3]

        assert.equal(dateRange.since, since.unix())
        assert.equal(dateRange.until, until.unix())

        since = moment('2018-03-30').startOf('day')
        until = moment('2018-03-31').endOf('day')

        dateRange = dateRanges[4]

        assert.equal(dateRange.since, since.unix())
        assert.equal(dateRange.until, until.unix())
    })
})

function initialize( result, response, source, fetchBOT ) {

    result.batchCount = 0;

    return function ( done ) {

        request.get = function ( url, callback ) {
            var metric;
            calledUrl = url
            url = url.split( BASEURL )[ 1 ];
            var params = url.split( "?" )[ 0 ].split( "/" );
            var app = params[ 1 ];
            var metric = params[ 3 ];
            var appData = response[ app ].data;
            var appName = response[ app ].name;
            var appError = response[ app ].error;
            var res;

            //we are in the get apps request
            if ( app == "me" ) {
                res = { data: response[ app ] }
            }
            // if there is no metric, we are in the first request so returning the name
            else if ( ! metric ) {
                res = { name: appName };
            } else if ( appError ) {
                res = { error: appError };
                response[ app ].error = null;
            } else {
                res = { data: appData[ metric ] }
            }

            res = JSON.stringify( res )

            callback( null, { 1: res } )
        }

        var options = {
            pastdays: fetchBOT ? undefined : "30",
            node: source.node || 'app',
            period: "daily",
            metrics: METRICS,
            itemList: source.apps,
            ignoreMissing: source.ignoreMissing
        }

        FacebookInsightStream.prototype.handleError = function ( error, retry ) {
            if ( error.message === 'retryError' ) {
                return retry()
            } else {
                this.emit( 'error', error );
            }
        }

        var testStream = new FacebookInsightStream( options )
        .on( "data", function ( chunk ) {
            result.data || ( result.data = [] );
            result.data = result.data.concat( chunk )
        })
        .on( "error", function ( error ) {
            result.error || ( result.error = error );
            done();
            done = function () {};
        })
        .on( "progress", function ( progress ) {
            result.progress = progress;
        })
        .on( "end", function () { done() } )

        result.stream = testStream;
    }
}

function reset () {
    request.get = req_get;
}

// generate data for all the metrics, unless recieved metricname to keep empty
function dataGenerator ( size, emptyMetric, name ) {
    var data = {};
    METRICS.forEach( function ( metric ) {
        var values = [];

        for ( var i = 1; i <= size; i++ ) {
            values.push( {
                //nuiqe date for each row
                end_time: "some_date-" + i ,
                value: i,
            })
        }

        data[ metric ] = []

        if ( metric != emptyMetric ) {
            data[ metric ].push( {
                name: metric,
                values: values,
            })
        }
    })
    // also saving the app name
    data.name = name;
    return data
}
