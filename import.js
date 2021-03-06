'use strict'

//Anticipates the frameworks_archiver script is run in a peer
//directory to this project

//https://github.com/sixteenmillimeter/frameworks_archiver

const fs = require('fs-extra')
const _ = require('lodash')
const path = require('path')
const exec = require('child_process').exec
const mbox = require('node-mbox')
const moment = require('moment')
const crypto = require('crypto')
const textract = require('textract')
const cheerio = require('cheerio')
const levenshtein = require('fast-levenshtein')
const Mbox = require('node-mbox')

const DB = require('db')

const messages = new DB('messages')

const ARCHIVES = {
	frameworks : '../frameworks_archiver/frameworks',
	hi_beam : '../frameworks_archiver/hi-beam/www.hi-beam.net/fw',
	archive_org : '../frameworks_archiver/archive-org/FRAMEWORKS'
}

const singleRe = new RegExp("'", 'g')
const newlineRe = new RegExp('\n\n', 'g')
const qmarkRe = new RegExp('\\?', 'g')

const LOG_DELIMETER = '========================================================================='
const GZ_DELIMETER = '-------------- next part --------------'

const YEAR_DELIMETER = ''

async function asyncExec (cmd) {
	return new Promise((resolve, reject) => {
		return exec(cmd, (err, stdio, stderr) => {
			if (err) return reject(err)
			return resolve(stdio)
		});
	});
}

function hash (str) {
	return crypto.createHash('sha256').update(str).digest('base64')
}

function escapeStr (str) {
	return str.replace(singleRe, `''`)//.replace(qmarkRe, '\?');
}

function match (a, b) {
	let difference = Math.abs(a.length - b.length) + 4
	return levenshtein.get(a, b) < difference;
}

async function to_messages (all, file) {
	let lines = all.split(/\r?\n/)
	let line
	let msgs = []
	let msg = ''
	let obj
	let stopped = false




	for (let i =0; i < lines.length; i++) {
		line = lines[i]
		if ((_.startsWith(line, 'From ') && _.startsWith(lines[i + 1], 'From: ')) ||
			(_.startsWith(line, 'Von: ') && (_.startsWith(lines[i + 2], 'Gesendet: ') || _.startsWith(lines[i + 3], 'Gesendet: '))) ||
			line.trim() === GZ_DELIMETER) {
			if (msg !== '') {
				msgs.push(msg + '')
				msg = ''
			}
			if (line.trim() !== GZ_DELIMETER) msg += line + '\n'
		} else {
			msg += line + '\n'
		}
	}

	console.dir(msgs.length)
	//process.exit()
	//fs.writeFileSync('msg.txt', all, 'utf8')
	//fs.writeFileSync('parsed.json', JSON.stringify(msgs, null, '\t'), 'utf8')
	//process.exit()

	for (let m of msgs) {
		lines = m.split(/\r?\n/)
		obj = {
			date_raw : null,
			date : null,

			original: file,
			response_to : null,
			from_email : null,
			from_name : null,

			subject : null,
			body : null,
			complete : escapeStr(encodeURIComponent(m))
		}
		stopped = false;
		//console.dir(m)

		for (let l of lines ) {
			try {
				obj.original = file;
				if (!obj.date_raw && _.startsWith(l, 'Date: ')) {
					obj.date_raw = l.replace('Date:', '').trim()
					obj.date = moment(obj.date_raw, 'ddd, DD MMM YYYY HH:mm:ss ZZ').unix() * 1000
				}else if (!obj.date_raw && _.startsWith(l, 'Datum: ')) {
					obj.date_raw = l.replace('Datum: ', '').trim()
					obj.date = moment(obj.date_raw, 'ddd, DD MMM YYYY HH:mm:ss ZZ').unix() * 1000
				} else if (!obj.subject && _.startsWith(l, 'Subject: ')) {
					obj.subject = l.replace('Subject: ', '').trim()
				} else if (!obj.subject && _.startsWith(l, 'Betreff: ')) {
					obj.subject = l.replace('Betreff: ', '').trim()
				} else if (!obj.from_name && _.startsWith(l, 'From: ')) {
					if (l.indexOf('(') !== -1) {
						obj.from_email = l.replace('From: ', '').trim().split('(')[0].trim()
						obj.from_name = l.replace('From: ', '').trim().split('(')[1].replace(')', '').trim()
						obj.from_email = obj.from_email.replace(' at ', '@')
					} else {
						obj.from_email = l.replace('From:', '').trim()
						obj.from_email = obj.from_email.replace(' at ', '@')
					}
				} else if (!obj.from_name && _.startsWith(l, 'An: ')) {
					if (l.indexOf('(') !== -1) {
						obj.from_email = l.replace('An: ', '').trim().split('(')[0].trim()
						obj.from_name = l.replace('An: ', '').trim().split('(')[1].replace(')', '').trim()
						obj.from_email = obj.from_email.replace(' at ', '@')
					} else {
						obj.from_email = l.replace('An: ', '').trim()
						obj.from_email = obj.from_email.replace(' at ', '@')
					}
				} else if (!obj.response_to && _.startsWith(l, 'In-Reply-To:')) {
					obj.response_to = l.replace('In-Reply-To:', '').trim()
				}
				obj.id = hash(`${obj.date}-${obj.subject}-${obj.from_email}`)
				if (obj.body === null && _.startsWith(l, 'Message-ID: ')) {
					obj.body = ''
				} else if (typeof obj.body === 'string' && !stopped) {
					//if (_.startsWith(l, 'From:') || _.startsWith('---- Original message ----')) {
						//stopped = true;
					//} else {
						obj.body += l + '\n'
					//}
				}
			} catch (err) {
				console.error(err)
				console.log(m)
				process.exit(1)
			}
		}

		if (obj.date_raw === null) {
			//console.dir(lines)
			continue;
		}
		//console.dir(obj)

		obj.plaintext = '';

		try {
			if (obj.subject) {
				obj.plaintext += obj.subject + '\n'
				obj.subject = escapeStr(obj.subject)
				
			}
			if (obj.from_name) 	{
				obj.plaintext += obj.subject + '\n'
				obj.from_name = escapeStr(obj.from_name)
				
			}
			if (obj.body) {
				obj.plaintext += obj.body + '\n'
				obj.body = escapeStr(obj.body)
				
			}
		} catch (err) {
			console.error('Error escaping', err)
		}

		if (obj.body && obj.body.indexOf('<html>') !== -1 ) {
			try {
				obj.body = await extractText(obj.body)
			} catch (err) {
				console.error(err)
			}
			obj.plaintext += obj.body;
			obj.body = escapeStr(obj.body);
		}

		if (obj.body === null) {
			continue;
		}

		obj.plaintext = escapeStr(obj.plaintext);
			
		try {
			await messages.insert(obj, true)
			console.log('Inserted', obj.id)
			//console.log(m)
			//if (m.indexOf('Von: ') !== -1 && m.indexOf('> Von:') === -1) process.exit()
		} catch (err) {
			if (err.code === '23505') {
				console.warn('Already exists', obj.id)
				//console.dir(obj.body)
			} else {
				console.error(err)
				console.warn(`Cannot insert`)
				//console.dir(obj)
				//process.exit()
			}
		}
	}
	return true
	//to_database()
}

async function from_mbox (mboxFile, file) {
	console.log(mboxFile)

	return new Promise((resolve, reject) => {
		const mbox    = new Mbox(mboxFile, { /* options */ });
		let count = 0;

		mbox.on('message', async function (msg) {
			const all = msg.toString()
			const lines = all.split(/\r?\n/)
			const obj = {
				date_raw : null,
				date : null,

				original: file,
				response_to : null,
				from_email : null,
				from_name : null,

				subject : null,
				body : null,
				complete : escapeStr(encodeURIComponent(msg))
			}
			let stopped = false

			for (let l of lines) {
				try {
					obj.original = file;
					if (!obj.date_raw && _.startsWith(l, 'Date: ')) {
						obj.date_raw = l.replace('Date:', '').trim()
						obj.date = moment(obj.date_raw, 'ddd, DD MMM YYYY HH:mm:ss ZZ').unix() * 1000
					}else if (!obj.date_raw && _.startsWith(l, 'Datum: ')) {
						obj.date_raw = l.replace('Datum: ', '').trim()
						obj.date = moment(obj.date_raw, 'ddd, DD MMM YYYY HH:mm:ss ZZ').unix() * 1000
					} else if (!obj.subject && _.startsWith(l, 'Subject: ')) {
						obj.subject = l.replace('Subject: ', '').trim()
					} else if (!obj.subject && _.startsWith(l, 'Betreff: ')) {
						obj.subject = l.replace('Betreff: ', '').trim()
					} else if (!obj.from_name && _.startsWith(l, 'From: ')) {
						if (l.indexOf('(') !== -1) {
							obj.from_email = l.replace('From: ', '').trim().split('(')[0].trim()
							obj.from_name = l.replace('From: ', '').trim().split('(')[1].replace(')', '').trim()
							obj.from_email = obj.from_email.replace(' at ', '@')
						} else {
							obj.from_email = l.replace('From:', '').trim()
							obj.from_email = obj.from_email.replace(' at ', '@')
						}
					} else if (!obj.from_name && _.startsWith(l, 'An: ')) {
						if (l.indexOf('(') !== -1) {
							obj.from_email = l.replace('An: ', '').trim().split('(')[0].trim()
							obj.from_name = l.replace('An: ', '').trim().split('(')[1].replace(')', '').trim()
							obj.from_email = obj.from_email.replace(' at ', '@')
						} else {
							obj.from_email = l.replace('An: ', '').trim()
							obj.from_email = obj.from_email.replace(' at ', '@')
						}
					} else if (!obj.response_to && _.startsWith(l, 'In-Reply-To:')) {
						obj.response_to = l.replace('In-Reply-To:', '').trim()
					}
					obj.id = hash(`${obj.date}-${obj.subject}-${obj.from_email}`)
					if (obj.body === null && _.startsWith(l, 'Message-ID: ')) {
						obj.body = ''
					} else if (typeof obj.body === 'string' && !stopped) {
						//if (_.startsWith(l, 'From:') || _.startsWith('---- Original message ----')) {
							//stopped = true;
						//} else {
							obj.body += l + '\n'
						//}
					}
				} catch (err) {
					console.error(err)
					console.log(m)
					process.exit(1)
				}
			}
			if (obj.date_raw === null) {
				//console.dir(lines)
				return;
			}
			if (_.startsWith(obj.subject, '[Frameworks] ')) {
				obj.subject = obj.subject.replace('[Frameworks] ', '')
			} else if (_.startsWith(obj.subject, 'Re: [Frameworks] ')) {
				obj.subject = obj.subject.replace('Re: [Frameworks] ', 'Re: ')
			}
			//console.dir(obj)

			obj.plaintext = '';

			try {
				if (obj.subject) {
					obj.plaintext += obj.subject + '\n'
					obj.subject = escapeStr(obj.subject)
					
				}
				if (obj.from_name) 	{
					obj.plaintext += obj.subject + '\n'
					obj.from_name = escapeStr(obj.from_name)
					
				}
				if (obj.body) {
					obj.plaintext += obj.body + '\n'
					obj.body = escapeStr(obj.body)
					
				}
			} catch (err) {
				console.error('Error escaping', err)
			}

			if (obj.body && obj.body.indexOf('<html>') !== -1 ) {
				try {
					obj.body = await extractText(obj.body)
				} catch (err) {
					console.error(err)
				}
				obj.plaintext += obj.body;
				obj.body = escapeStr(obj.body)
			}

			if (obj.body === null) {
				return
			}

			obj.plaintext = escapeStr(obj.plaintext)
			
			try {
				await messages.insert(obj, true)
				console.log('Inserted', obj.id)
				count++
				//console.log(m)
				//if (m.indexOf('Von: ') !== -1 && m.indexOf('> Von:') === -1) process.exit()
			} catch (err) {
				if (err.code === '23505') {
					console.warn('Already exists', obj.id)
					//console.dir(obj.body)
				} else {
					console.error(err)
					console.warn(`Cannot insert`)
					//console.dir(obj)
					//process.exit()
				}
			}
			return true
		})

		mbox.on('error', function(err) {
			console.error('got an error', err)
			process.exit()
		})

		mbox.on('end', function() {
			console.log(`Completed processing file ${file} with ${count} inserted`)
			return resolve(true)
		})
	})
}

async function import_frameworks () {
	console.time('import_frameworks')
	const ARCHIVE = path.join(__dirname, ARCHIVES.frameworks)
	let files = await fs.readdir(ARCHIVE)
	let filePath
	let tmpPath
	let dir
	let all
	let date

	files = files.filter(file => {
		if (file.indexOf('.txt.gz') !== -1) return file
	})

	for (let file of files) {
		filePath = path.join(ARCHIVE, file)
		date = new Date().getTime()
		dir = `/tmp/${date}`
		tmpPath = `/tmp/${date}/${date}.txt`

		try {
			await fs.mkdir(dir)
		} catch (err) {
			console.error(err)
		}

		try {
			await asyncExec(`gunzip < "${filePath}" > "${tmpPath}"`)
		} catch (err) {
			console.error('Error unzipping file', err)
		}

		try {
			//all = await fs.readFile(tmpPath, 'utf8')
			await asyncExec(`./mailman2mbox "${dir}"`)
			//console.dir(all)
		} catch (err) {
			console.error('Error reading temporary file', err)
		}

		try {
			//await to_messages(all, file)
			await from_mbox(tmpPath.replace('.txt', '.mbox'), file)
		} catch (err) {
			console.error(err)
		}

		try {
			await fs.unlink(tmpPath)
		} catch (err) {
			console.error(`Error unlinking file ${tmpPath}`)
		}
	}
	console.timeEnd('import_frameworks')
}

async function log_to_messages (all, file) {
	let lines = all.split(/\r?\n/)
	let msgs = []
	let msg = ''
	let delimeter
	let prev
	let obj
	let delimeter_search = lines.find(line => {
		if (line.trim() === LOG_DELIMETER) return line
	})
	let similar

	if (delimeter_search) {
		delimeter = LOG_DELIMETER
	}

	for (let line of lines) {
		if (delimeter && line.trim() === delimeter && msg !== '') {
			msgs.push(msg + '')
			msg = ''
		} else {
			msg += line + '\n'
		}
	}

	/*
	Date:         Fri, 11 Jan 2002 14:41:20 -0600
	Reply-To:     Experimental Film Discussion List <FRAMEWORKS@LISTSERV.AOL.COM>
	Sender:       Experimental Film Discussion List <FRAMEWORKS@LISTSERV.AOL.COM>
	From:         Chicago Underground Film Festival <info@CUFF.ORG>
	Subject:      Re: Reaping profits a-g film?
	In-Reply-To:  <Pine.NEB.4.40.0201111434390.4927-100000@panix2.panix.com>
	Mime-version: 1.0
	Content-type: text/plain; charset="US-ASCII"
	Content-transfer-encoding: 7bit

	"id" 		: "VARCHAR PRIMARY KEY",
	"original"  : "VARCHAR",

	"date_raw" 	: "VARCHAR",
	"date" 		: "BIGINT",
	
	"response_to" :"VARCHAR",
	"from_email": "VARCHAR",
	"from_name" : "VARCHAR",
	
	"subject" 	: "VARCHAR",
	"body" 		: "VARCHAR",
	"fulltext"  : "TSVECTOR"

	*/
	let count = 0;
	for (let m of msgs) {
		lines = m.split(/\r?\n/)
		obj = {
			date_raw : null,
			date : null,
			original : file,
			response_to : null,
			from_email : null,
			from_name : null,

			subject : null,
			body : null,
			complete : escapeStr(encodeURIComponent(m))
		}
		for (let l of lines ) {
			try {
				if (!obj.date_raw && _.startsWith(l, 'Date:')) {
					obj.date_raw = l.replace('Date:', '').trim()
					obj.date = moment(obj.date_raw, 'ddd, DD MMM YYYY HH:mm:ss ZZ').unix() * 1000
				} else if (!obj.subject && _.startsWith(l, 'Subject:')) {
					obj.subject = l.replace('Subject:', '').trim()
					if (_.startsWith(obj.subject, '[Frameworks] ')) {
						obj.subject = obj.subject.replace('[Frameworks] ', '')
					} else if (_.startsWith(obj.subject, 'Re: [Frameworks] ')) {
						obj.subject = obj.subject.replace('Re: [Frameworks] ', 'Re: ')
					}
				} else if (!obj.from_name && _.startsWith(l, 'From:')) {
					if (l.indexOf('<') !== -1) {
						obj.from_name = l.replace('From:', '').trim().split('<')[0].trim()
						obj.from_email = l.replace('From:', '').trim().split('<')[1].replace('>', '').trim()
					} else {
						obj.from_email = l.replace('From:', '').trim()
					}
					
				} else if (!obj.response_to && _.startsWith(l, 'In-Reply-To:')) {
					obj.response_to = l.replace('In-Reply-To:', '').trim()
				}
				if (obj.body === null && _.startsWith(l.toLowerCase(), 'content-type:')) {
					obj.body = ''
				} else if (typeof obj.body === 'string' && l.indexOf('For info on FrameWorks, contact Pip Chodorov at <PipChod@aol.com>.') === -1 &&
					l.indexOf('__________________________________________________________________') === -1 &&
					!_.startsWith(l.toLowerCase(), 'content-transfer-encoding:')) {
					obj.body += l + '\n'
				}
				obj.id = hash(`${obj.date}-${obj.subject}-${obj.from_email}`)
			} catch (err) {
				console.error(err)
				console.log(m)
				process.exit(1)
			}
		}

		obj.plaintext = '';

		try {
			if (obj.subject) {
				obj.plaintext += obj.subject + '\n'
				obj.subject = escapeStr(obj.subject)
				
			}
			if (obj.from_name) 	{
				obj.plaintext += obj.subject + '\n'
				obj.from_name = escapeStr(obj.from_name)
			}
			if (obj.body) {
				obj.plaintext += obj.body + '\n'
				obj.body = escapeStr(obj.body)
			}
			
		} catch (err) {
			console.error('Error escaping', err)
		}

		if (obj.body && obj.body.indexOf('<html>') !== -1 ) {
			try {
				obj.body = await extractText(obj.body)
			} catch (err) {
				console.error(err)
			}
			obj.plaintext += obj.body
			obj.body = escapeStr(obj.body)
		}

		if (obj.body === null) {
			continue;
		}

		obj.plaintext = escapeStr(obj.plaintext)


		let similarWhere = `date = ${obj.date} OR id = '${obj.id}'`

		try {
			similar = await messages.find(similarWhere, true)
		} catch (err) {
			console.error(err);
			process.exit()
		}

		if (similar && similar.rows && similar.rows.length > 0) {
			let found = false
			for (let row of similar.rows) {
				if (obj.id === row.id
					|| match(obj.subject, escapeStr(row.subject))) {
					console.log(`Already exists`, row.id)
					found = true

				}
			}
			if (!found) {
				console.log(`False alarm`)
				//console.dir(obj)
				//console.dir(similar.rows)
				//process.exit()
			} else {
				continue
			}
		}

		try {
			//console.dir(obj)
			await messages.insert(obj, true)
			console.log('Inserted', obj.id )
			count++;
		} catch (err) {
			if (err.code === '23505') {
				console.warn('Already exists', obj.id)
				//console.dir(obj.body)
			} else {
				console.error(err)
				process.exit()
			}
		}
	}
	console.log(`Inserted ${count} messages`)
	return true
	//to_database();
}

async function extractText (html) {
	return new Promise(async (resolve, reject) =>{
		let filePath = `/tmp/${+new Date()}.html`
		try {
			await fs.writeFile(filePath, html, 'utf8')
		} catch (err) {
			log.error('Error writing file', err)
		}
		textract.fromFileWithPath(filePath, async (err, text ) =>{
			if (err) return reject(err)
			try {
				fs.unlink(filePath)
			} catch (err) {
				log.error('Error erasing tmp file', err)
			}
			return resolve(text)
		})
	})
}

async function import_archiveorg () {
	console.time('import_archiveorg')
	let ARCHIVE = path.join(__dirname, ARCHIVES.archive_org)
	let files = await fs.readdir(ARCHIVE)
	let filePath
	let all

	files = files.filter(file => {
		if (file.indexOf('.txt') !== -1) return file
	})

	for (let file of files) {
		filePath = path.join(ARCHIVE, file);

		try {
			all = await fs.readFile(filePath, 'utf8')
		} catch (err) {
			console.error('Error reading temporary file', err)
		}
		try {
			await log_to_messages(all, file)
		} catch (err) {
			console.error(err);
		}
	}
	console.timeEnd('import_archiveorg')
	process.exit()
}

async function html_to_message (html, file, dir) {
	const $ = cheerio.load(html)
	const obj = {
		date_raw : null,
		date : null,
		original : file,
		response_to : null,
		from_email : null,
		from_name : null,

		subject : null,
		body : null,
		complete : escapeStr(encodeURIComponent(html))
	}
	let header = $('p.headers').text().trim()
	let parts = header.split('\n')
	let bodyHtml = (html.split('<!-- body="start" -->')[1] + '' ).split('_______________________________________________\n<br>\nFrameWorks mailing list')[0]
	let links = $('ul.links li')
	let link
	let body
	let similar
	let lines

	obj.subject = ($('h1').text() + '')//.replace('[Frameworks] ', '')
	
	if (_.startsWith(obj.subject, '[Frameworks] ')) {
		obj.subject = obj.subject.replace('[Frameworks] ', '')
	} else if (_.startsWith(obj.subject, 'Re: [Frameworks] ')) {
		obj.subject = obj.subject.replace('Re: [Frameworks] ', 'Re: ')
	}

	try {
		obj.from_name = parts[0].replace('From: ', '').replace(' (email suppressed)', '').replace('email suppressed', '')
		//'Tue Aug 31 2010 - 10:23:39 PDT'
		obj.date_raw = parts[1].replace('Date: ', '')
		obj.date = obj.date = moment(obj.date_raw, 'ddd MMM DD YYYY - HH:mm:ss ZZ').unix() * 1000

	} catch (err) {
		lines = html.split('\n')
		header = lines.find(row => {
			if (row.indexOf('<!-- sent="') !== -1) {
				return true
			}
			return false
		})
		//Tue, 31 Aug 2010 13:23:39 -0400
		obj.date_raw = header.trim().replace('<!-- sent="', '').replace('" -->', '').split('(')[0]
		obj.date = obj.date = moment(obj.date_raw, 'ddd, D MMM YYYY HH:mm:ss ZZ').unix() * 1000
	}

	if (obj.from_name === '') {
		obj.from_name = null
	}

	for (let i = 0; i < links.length; i++) {
		link = $('ul.links li').eq(i).text();
		if (link.indexOf('In reply to:') !== -1) {
			obj.response_to = path.join(dir, $('ul.links li').eq(i).find('a').attr('href'))
		}
	}

	if (!obj.body) {
		body = cheerio.load(bodyHtml)
		obj.body = (body.text() + '').replace(newlineRe, '\n');
	}

	if (obj.body === null) {
		//return
	}

	obj.id = hash(`${obj.date}-${obj.subject}-${obj.from_name}`)
	
	//console.dir(obj)

	obj.plaintext = '';

	try {
		if (obj.subject) {
			obj.plaintext += obj.subject + '\n'
			obj.subject = escapeStr(obj.subject)
		}
		if (obj.from_name) 	{
			obj.plaintext += obj.subject + '\n'
			obj.from_name = escapeStr(obj.from_name)
		}
		if (obj.body) {
			obj.plaintext += obj.body + '\n'
			obj.body = escapeStr(obj.body)
		}
		obj.plaintext = escapeStr(obj.plaintext)
	} catch (err) {
		console.error('Error escaping', err)
	}

	//process.exit()

	let similarWhere = `date = ${obj.date} OR id = '${obj.id}'`

	try {
		similar = await messages.find(similarWhere, true)
	} catch (err) {
		console.error(err);
		process.exit()
	}

	if (similar && similar.rows && similar.rows.length > 0) {
		let found = false
		for (let row of similar.rows) {
			if (obj.id === row.id
				|| match(obj.subject, escapeStr(row.subject))) {
				console.log(`Already exists`, row.id)
				found = true
				return
			}
		}
		if (!found) {
			console.log(`False alarm`)
			//console.dir(obj)
			//console.dir(similar.rows)
			//process.exit()
		}
	}

	try {
		//console.dir(obj)
		await messages.insert(obj, true)
		console.log('Inserted', obj.id )
	} catch (err) {
		if (err.code === '23505') {
			console.warn('Already exists', obj.id)
			//console.dir(obj.body)
		} else {
			console.error(err)
			process.exit()
		}
	}

}

const hibeam_blacklist = [
	'attachment.html',
	'author.html',
	'date.html',
	'index.html',
	'subject.html'
]

async function import_hibeam () {
	console.time('import_hibeam')
	let ARCHIVE = path.join(__dirname, ARCHIVES.hi_beam)
	let dirs = await fs.readdir(ARCHIVE)
	let files;
	let html;
	for (let dir of dirs) {
		//console.log(path.join(ARCHIVE, dir))
		files = await fs.readdir(path.join(ARCHIVE, dir))
		for (let file of files) {
			if  (hibeam_blacklist.indexOf(file) === -1) {
				//console.log(path.join(ARCHIVE, dir, file))
				try {
					html = await fs.readFile(path.join(ARCHIVE, dir, file), 'utf8')
				} catch (err) {
					console.error(err)
				}

				try {
					await html_to_message(html, path.join(dir, file), dir)
				} catch (err) {
					console.error(err)
				}

			}
		}
	}
	console.timeEnd('import_hibeam')
}

async function tsvectors () {
	const query = `SELECT id,plaintext FROM messages WHERE fulltext IS NULL;`
	let res
	let message
	let txt
	let tsvQuery

	try {
		res = await messages.query(query)
	} catch (err) {
		console.error(err)
	}

	for (let m of res.rows) {
		try {
			message = await messages.find(`id = '${m.id}'`, true)
		} catch (err) {
			console.error(err)
		}
		
		txt = escapeStr(m.plaintext)
		tsvQuery = `UPDATE messages SET fulltext = to_tsvector('${txt}') WHERE id = '${m.id}';`
		
		try {
			await messages.query(tsvQuery)
			console.log(`Added tsvector data to ${m.id}`)
		} catch (err) {
			console.error(err)
		}
	}
}

async function dedupe () {

}

async function threads () {

}

function matchEmail (rows, date) {
	let email = ''
	let lemail = ''
	let match = true
	let distance = Infinity
	for (let row of rows) {
		if (email === '') {
			email = row.from_email
			lemail = row.from_email.toLowerCase()
		} else if (lemail !== row.from_email.toLowerCase()) {
			match = false
		}
	}

	if (!match) {
		for (let row of rows) {
			if (Math.abs(row.date - date) < distance) {
				distance = Math.abs(row.date - date)
				email = row.from_email
				match = true
			}
		}
		//console.dir(rows.map(el => el.from_email))
		//console.log(rows[0].from_name)
		//console.log(email)
	}
	return match ? email : null
}

async function fillin () {
	let where = `original LIKE '%.html%' AND from_email IS NULL AND from_name IS NOT NULL`;
	let res
	let match
	let email

	try {
		res = await messages.find(where)
	} catch (err) {
		console.error(err)
	}
	console.log(res.rows.length)

	for (let row of res.rows) {
		where = `from_name LIKE '${escapeStr(row.from_name.replace(`'undefined'`, ''))}' AND from_email IS NOT NULL AND ( original LIKE '%.txt%' OR original LIKE '%.txt.gz%')`
			
		try {
			match = await messages.find(where, true)
		} catch (err) {
			console.error(err)
			//process.exit()
			continue
		}
		if (match.rows && match.rows.length > 0) {
			email = matchEmail(match.rows, row.date)
			if (!email) {
				console.log(`Inconclusive matches found for ${row.from_name} from ${match.rows.length} matches`)
				//console.dir(match.rows.map(el => el.from_email))
				//process.exit()
			} else {
				try {
					await messages.update(`id = '${row.id}'`, { from_email : email }, true)
					console.log(`Updated ${row.id} with email ${email}`)
				} catch (err) {
					console.error(err)
					process.exit()
				}
			}
			//process.exit()
		} else {
			console.log(`No match found for ${row.from_name}`)
		}
	}
}

async function main () {
	try {
		await messages.connect()
		await import_frameworks()
		//await import_archiveorg()
		//await import_hibeam()
		await fillin()
		await tsvectors()
	} catch (err) {
		console.error(err);
	}
	process.exit()
}

main();
