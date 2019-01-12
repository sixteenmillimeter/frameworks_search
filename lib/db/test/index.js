'use strict'

const db = require('../index.js')

QUnit.test('require', function (assert) {
	assert.ok(typeof db === 'object', 'Database module is valid object when required')
})