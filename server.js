if(typeof module !== "undefined") {
	var fs = require('fs');
	var http = require('http')
	var ws = require('ws')
}

function Server() {
	this.client_list = []
	this.game_map = {}
}

Server.prototype.start_http_server = function() {
	var self = this;
	self.port = 8080;
	http.createServer(function (req, res) {
		console.log(req.url)
		self.content = fs.readFileSync('index.html');
		self.javascript = fs.readFileSync('server.js');
		res.writeHead(200, {'Content-Type': 'text/html'});
		if(req.url == '/server.js') {
			res.end(self.javascript);
		}
		else if(req.url == '/') {
			res.end(self.content);
		}
		else {
			res.end('invalid page');
		}
	}).listen(self.port);
}

Server.prototype.accept_client = function(ws) {
	var self = this

	ws.on('message', function incoming(message) {
		message = JSON.parse(message)
		console.log('received:', JSON.stringify(message, null, 4));
		if(message.type == 'client') {
			message.ws = ws
			self.client_list.push(message)
		}
		else if(message.type == 'answer') {
			var word = message.word
			var status = 'invalid'
			if(ws.game.all_word_map[word]) {
				status = 'new'
			}
			var result_message = {
				type: 'result',
				status: status
			}
			ws.send(JSON.stringify(result_message))
		}
	});

	//ws.send('something');
}

Server.prototype.start_websocket_server = function() {
	var self = this
	var WebSocketServer = ws.Server
	var wss = new WebSocketServer({ port: 8090 });

	wss.on('connection', function connection(ws) {
		self.accept_client(ws)
	});

	setInterval(function() {
		self.match_clients()
	}, 1000)
}

Server.prototype.match_clients = function() {
	//TODO: Sort client list by rating
	console.log('matching clients %d', this.client_list.length)

	var length = this.client_list.length
	if(length % 2 == 1) {
		length -= 1
	}

	if(length > 1) {
		for(var i = 0; i < length; i += 2) {
			var game = new Game()
			game.generate_grid()
			game.find_words()
			game.client_list = [this.client_list[i], this.client_list[i + 1]]
			game.id = Game.count++
			this.game_map[game.id] = game

			var game_message = {
				type: 'game',
				id: game.id,
				letter_grid: game.letter_grid,
				//player_list: game.
			}
			//console.log(game_message)
			var game_message_string = JSON.stringify(game_message)
			console.log(game_message_string)

			for(var j = 0; j < game.client_list.length; j++) {
				var client_info = game.client_list[j]
				client_info.ws.send(game_message_string)
				client_info.ws.game = game
			}
		}
		this.client_list.splice(0, length)
	}
	else {
		// Do nothing, wait for another player
	}
}

Server.prototype.start = function() {
}

function Client() {
	
}

Client.prototype.start = function() {
	var self = this

	// Send a message to the server that wer are ready to play a game
	self.socket = new WebSocket('ws://localhost:8090')
	var name = document.getElementById('name').value
	self.socket.onopen = function() {
		var client_message = {
			type: 'client',
			name: name,
			rating: 1500
		}
		self.socket.send( JSON.stringify(client_message) )
	}
	self.socket.onmessage = function(message) {
		self.receive(JSON.parse(message.data))
	}

	// Mark the Button as waiting
	var button = document.getElementById('start-button')
	button.innerText = 'Waiting'
	button.style['background-color'] = 'blue'
}

Client.prototype.receive = function(message) {
	var self = this
	console.log(message)
	if(message.type == 'game') {
		// Load grid and player objects
		this.game = new Game()
		this.game.letter_grid = message.letter_grid
		this.game.id = message.id

		this.game.update_letter_grid()

		// Hide/Show divs
		document.getElementById('start').style.display = 'none';
		document.getElementById('game').style.display = 'block';

		this.game.attach_handlers()
	}
	else if(message.type == 'result') {
		// Change background to green/red/yellow depending on success
		self.game.each(function(cell, row, col, element) {
			if(cell.highlight) {
				if(message.status == 'invalid') {
					element.style['background-color'] = 'red'
				}
				else if(message.status == 'existing') {
					element.style['background-color'] = 'yellow'
				}
				else {
					element.style['background-color'] = 'green'
				}
			}
		})

		// Change background back to white after interval
		setTimeout(function() {
			self.game.each(function(cell, row, col, element) {
				cell.highlight = false
				element.style['background-color'] = ''
			})
		}, 500)
	}
}




function Game() {
	this.has_started = false
}

Game.count = 1

Game.prototype.update_letter_grid = function() {
	this.each(function(cell, row, col, element) {
		element.innerText = cell.letter
	})
}

Game.prototype.attach_handlers = function() {
	var self = this
	self.touching = false

	self.each(function(cell, row, col, element) {
		// Add Touch Handlers
		element.addEventListener('touchstart', function(event) {
			self.start_move(cell, element)
		})
		element.addEventListener('touchmove', function(event) {
			self.move(cell, element)
		})
		element.addEventListener('touchend', function(event) {
			self.end_move(cell, element)
		})

		// Add Mouse Handlers
		element.addEventListener('mousedown', function(event) {
			self.start_move(cell, element)
		})
		element.addEventListener('mousemove', function(event) {
			self.move(cell, element)
		})
		element.addEventListener('mouseup', function(event) {
			self.end_move(cell, element)
		})
	})
}

Game.prototype.move = function(cell, element) {
	if(this.touching) {
		if(!cell.highlight) {
			this.current_word += cell.letter
			cell.highlight = true
			element.style['background-color'] = 'blue'
		}
	}
}

Game.prototype.start_move = function(cell, element) {
	this.touching = true
	this.current_word = ''
}

Game.prototype.end_move = function(cell, element) {
	this.touching = false

	// Send to server
	var answer_message = {
		type: 'answer',
		word: this.current_word
	}
	client.socket.send(JSON.stringify(answer_message))
}

Game.prototype.each = function(method) {
	for(var row = 0; row < 4; row++) {
		for(var col = 0; col < 4; col++) {
			var cell = this.letter_grid[row][col]
			var id = '' + row + col
			var element = document.getElementById(id)
			method(cell, row, col, element)
		}
	}
}

// Called on the server:
// 1. Create the Letter Grid
// 2. Start the timer
Game.prototype.start = function() {

}

// http://sedition.com/perl/javascript-fy.html
function shuffle ( myArray ) {
	var i = myArray.length;
	if ( i == 0 ) return false;
	while ( --i ) {
		var j = Math.floor( Math.random() * ( i + 1 ) );
		var tempi = myArray[i];
		var tempj = myArray[j];
		myArray[i] = tempj;
		myArray[j] = tempi;
	}
}

function random_element(array) {
	var choice = Math.floor(Math.random() * array.length)
	return array[choice]
}

Game.prototype.generate_grid = function() {
	var cube_list = [
		'TSTDIY',
		'RLIEXD',
		'OTSSEI',
		'VYRDEL',
		'RTTELY',
		'PSAFFK',
		'ZHRLNN',
		'NGEWEH',
		'MUOCIT',
		'OBBAJO',
		'IENUES',
		'NUIHQM',
		'GEENAA',
		'WTOOTA',
		'RETWHV',
		'AHSPOC',
	]
	shuffle(cube_list)

	var cube_index = 0
	this.letter_grid = []
	for(var row = 0; row < 4; row++) {
		var line = []
		for(var col = 0; col < 4; col++) {
			var cube = cube_list[cube_index++]
			var letter = random_element(cube)
			//console.log(cube, letter)
			var cell = new Cell(letter)
			line.push(cell)
		}
		this.letter_grid.push(line)
	}
}

function Node(letter) {
	this.letter = letter
	this.word = false
	this.children = []
}

Node.prototype.add = function(word, index) {
	if(word.length == index) {
		this.word = word
		return;
	}

	if(!index) index = 0;

	var letter = word[index]

	// Finding the child node with letter
	for(var i = 0; i < this.children.length; i++) {
		var child = this.children[i]
		if(child.letter == letter) {
			child.add(word, index + 1)
			return
		}
	}

	// the case when the letter is not found and needs to be added
	var child = new Node(letter)
	child.add(word, index + 1)
	this.children.push(child)
}

Node.prototype.find_child = function(letter) {
	var child_node = null
	for(var j = 0; j < this.children.length; j++) {
		var child = this.children[j]
		if(child.letter == letter) {
			child_node = child
		}
	}
	return child_node
}

function Cell(letter) {
	this.letter = letter
	this.visited = false
}

Game.read_word_list = function(filename) {
	var string = fs.readFileSync(filename, 'utf8')
	var word_list = string.split("\n")
	this.build_trie(word_list)
}

Game.build_trie = function(word_list) {
	Game.trie = new Node()
	for(var i = 0; i < word_list.length; i++) {
		var word = word_list[i]
		Game.trie.add(word)
	}
}


Game.direction_list = [
	{ dx: 0, dy: -1 },  // top
	{ dx: 1, dy: -1 },  // top right
	{ dx: 1, dy: 0 },  // right
	{ dx: 1, dy: 1 },  // bottom right
	{ dx: 0, dy: 1 },  // bottom
	{ dx: -1, dy: 1 },  // bottom left
	{ dx: -1, dy: 0 },  // left
	{ dx: -1, dy: -1 },  // top left
];

// Start at each possible location in the grid
Game.prototype.find_words = function() {
	this.all_word_map = {}
	for(var row = 0; row < 4; row++) {
		for(var col = 0; col < 4; col++) {
			var cell = this.letter_grid[row][col]
			cell.visited = true
			var letter = cell.letter
			var node = Game.trie.find_child(letter)
			this.search(row, col, node, letter)
			cell.visited = false
		}
	}
}

// Recursively depth-first search the grid/Trie at the same time
Game.prototype.search = function(row, col, node, word) {
	//console.log(row, col, word)
	// If a word is found, add it to the all_word_map
	if(node.word) {
		this.all_word_map[word] = true
	}

	// Recursing through possible directions	
	for(var i = 0; i < Game.direction_list.length; i++) {
		var direction = Game.direction_list[i]
		var new_row = row + direction.dy
		var new_col = col + direction.dx
		if(new_row >= 0
			&& new_row <= 3
			&& new_col >= 0
			&& new_col <= 3)
		{
			// Loop through node's children and find the current cell's location
			var cell = this.letter_grid[new_row][new_col]
			var letter = cell.letter
			var new_node = node.find_child(letter)
			if(!new_node) {
				//console.log('new node not found')
				continue
			}
			cell.visited = true
			this.search(new_row, new_col, new_node, word + letter)
			cell.visited = false
		}
	}
}

Game.prototype.next_page = function() {

}

function Player() {

}

function start_server() {
	server = new Server()
	server.start_http_server()
	server.start_websocket_server()
}

function test() {

	//var word_list = ['ACED', 'BRIG', 'DOWN', 'LITE', 'BROWN',]
	//Game.build_trie(word_list)
	//console.log(JSON.stringify(Game.trie, null, 4))

	var game = new Game()
	game.letter_grid = [
		['A', 'C', 'E', 'D'],
		['B', 'R', 'I', 'G'],
		['D', 'O', 'W', 'N'],
		['L', 'I', 'T', 'E'],
	]
	for(var y = 0; y < 4; y++)
		for(var x = 0; x < 4; x++)
			game.letter_grid[y][x] = new Cell(game.letter_grid[y][x])

	game.find_words()
	var word_list = Object.keys(game.all_word_map)
	console.log(word_list.length, word_list.join(', '))
}

if(typeof module !== "undefined") {
	Game.read_word_list('word_list.txt')
	start_server()
}
