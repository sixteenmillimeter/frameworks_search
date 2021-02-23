'use strict';

const Table = require('cli-table');

const DB = require('db');
const messages = new DB('messages')

const singleRe = new RegExp("'", 'g')

function getTerm() {
	const term = process.argv[process.argv.length - 1]
	if (term.indexOf('frameworks_search/search.js') === -1) {
		return term.replace(singleRe, "''")
	}
	console.error(`ERROR: Please include a search term`)
	process.exit(1)
}

function display (rows) {
	const table = new Table({
	    head: ['date', 'from', 'headline']
		, colWidths: [48, 48, 48]
	})

	for (let row of rows) {
		table.push( [ row.date_raw, row.subject + '', row.headline.slice(0, 40) ] )
		table.push( [ row.id, `${row.from_name} <${row.from_email}>`, ''] )
	}

	console.log(table.toString())
}

async function search () {
	const cleanTerm = getTerm()
	const searchQuery = `SELECT id,subject,date,date_raw,rank,headline,from_name,from_email 
		FROM messages, 
			plainto_tsquery('${cleanTerm}') AS query, 
			ts_rank_cd(fulltext, query, 32) AS rank, 
			ts_headline(plaintext, query) as headline 
		WHERE query @@ fulltext 
		ORDER BY rank DESC;`
	let res

	console.log(`Searching "${cleanTerm}"...`)

	try {
		res = await messages.query(searchQuery)
	} catch (err) {
		console.error(err)
		process.exit(2)
	}

	display(res.rows)
	console.log(`Found ${res.rows.length} result${res.rows.length !== 1 ? 's' : ''}`)
}

async function main () {
	try {
		await messages.connect()
		await search()
	} catch (err) {
		console.error(err)
	}
	process.exit()
}

main()
