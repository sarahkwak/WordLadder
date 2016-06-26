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
	}, 100)
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
			game.client_list = [this.client_list[i], this.client_list[i + 1]]
			game.id = Game.count++
			this.game_map[game.id] = game

			var game_message = {
				type: 'game',
				id: game.id,
				letter_grid: game.letter_grid,
				//player_list: game.
			}

			for(var j = 0; j < game.client_list.length; j++) {
				var client_info = game.client_list[j]
				client_info.ws.send(JSON.stringify(game_message))
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

Client.prototype.init = function() {
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
	console.log(message)
	if(message.type == 'game') {
		// Load grid and player objects
		this.game = new Game()

		// Hide/Show divs
		document.getElementById('start').style.display = 'none';
		document.getElementById('game').style.display = 'block';
	}
}




function Game() {
	this.has_started = false
}

Game.count = 1

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
	var choice = Math.random() * array.length
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
			line.push(letter)
		}
		this.letter_grid.push(line)
	}
}

function Node(letter) {
	this.letter = letter
	this.is_word = false
	this.children = []
}

Node.prototype.add = function(word) {
	if(word.length <= 0) {
		this.is_word = true
		return;
	}

	var letter = word[0]
	var next_word = word.substring(1)

	// Finding the child node with letter
	for(var i = 0; i < this.children.length; i++) {
		var child = this.children[i]
		if(child.letter == letter) {
			child.add(next_word)
			return
		}
	}

	// the case when the letter is not found and needs to be added
	var child = new Node(letter)
	child.add(next_word)
	this.children.push(child)
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

Game.prototype.find_words = function() {
	var direction_list = [
		{ dx: 0, dy: -1 },  // top
		{ dx: 1, dy: -1 },  // top right
		{ dx: 1, dy: 0 },  // right
		{ dx: 1, dy: 1 },  // bottom right
		{ dx: 0, dy: 1 },  // bottom
		{ dx: -1, dy: 1 },  // bottom left
		{ dx: -1, dy: 0 },  // left
		{ dx: -1, dy: -1 },  // top left
	];

	
}

Game.prototype.next_page = function() {

}

function Player() {

}

if(typeof module !== "undefined") {
	var word_list = ['tans', 'taste', 'wants', 'welt', 'weld']
	Game.build_trie(word_list)
	console.log(JSON.stringify(Game.trie, null, 4))

	server = new Server()
	server.start_http_server()
	server.start_websocket_server()
}
