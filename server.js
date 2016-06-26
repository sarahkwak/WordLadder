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
			var player_word_map = ws.game.player_word_map[ws.index]
			if(player_word_map[word]) {
				status = 'existing'
			}
			else if(ws.game.all_word_map[word]) {
				status = 'new'
				player_word_map[word] = true

				// Send increment message to OTHER client
				var other_index = 1 - ws.index
				var other_client = ws.game.client_list[other_index]
				var increment_message = { type: 'increment' }
				other_client.ws.send(JSON.stringify(increment_message))
			}
			var result_message = {
				type: 'result',
				word: word,
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
	var self = this
	//TODO: Sort client list by rating
	console.log('matching clients %d', self.client_list.length)

	var length = self.client_list.length
	if(length % 2 == 1) {
		length -= 1
	}

	if(length > 1) {
		for(var i = 0; i < length; i += 2) {
			var game = new Game()
			game.generate_grid()
			game.find_words()

			game.client_list = []
			for(var j = 0; j < 2; j++) {
				var client = self.client_list[i + j]
				client.ws.index = j
				client.ws.game = game
				game.client_list.push(client)
			}

			game.id = Game.count++
			self.game_map[game.id] = game

			for(var j = 0; j < game.client_list.length; j++) {
				var other_player_name = game.client_list[1 - j].name
				var game_message = {
					type: 'game',
					id: game.id,
					letter_grid: game.letter_grid,
					other_player_name: other_player_name
				}
				//console.log(game_message)
				var game_message_string = JSON.stringify(game_message)
				console.log(game_message_string)

				var client_info = game.client_list[j]
				client_info.ws.send(game_message_string)
				client_info.ws.game = game
			}

			// Set up game finished handler
			setTimeout(function() {
				// compute score
				var message = game.compute_scores()
				// send back to both clients
				for(var k = 0; k < game.client_list.length; k++) {
					var client = game.client_list[k]
					client.ws.send(JSON.stringify(message))
				}
			}, Client.time_max * 1000)
		}
		self.client_list.splice(0, length)
	}
	else {
		// Do nothing, wait for another player
	}
}

Server.prototype.start = function() {
	server.start_http_server()
	server.start_websocket_server()
}

function Client() {
	this.time_left = Client.time_max
}

Client.time_max = 60

Client.prototype.start = function() {
	var self = this

	// Send a message to the server that wer are ready to play a game
	self.socket = new WebSocket('ws://strats.4kdev.com:8090')
	//self.socket = new WebSocket('ws://localhost:8090')
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

Client.prototype.increment_element = function(id) {
	var word_count = parseInt( document.getElementById(id).innerText )
	document.getElementById(id).innerText = word_count + 1
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
		document.getElementById('other-player').style.display = 'block';

		this.game.attach_handlers()

		document.getElementById('other-player-name').innerText = message.other_player_name

		setInterval(function() {
			var element = document.getElementById('progress-bar')
			self.time_left -= 1
			var percent = self.time_left * 100 / Client.time_max
			element.style.width = percent + '%'
		}, 1000)
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

		// Add word to word list
		if(message.status == 'new') {
			var word_element = document.createElement('div')
			word_element.innerText = message.word
			document.getElementById('word-list').appendChild(word_element)

			// Increment count
			self.increment_element('player-score')
		}

		// Change background back to white after interval
		setTimeout(function() {
			self.game.each(function(cell, row, col, element) {
				cell.highlight = false
				element.style['background-color'] = ''
			})
		}, 500)
	}
	else if(message.type == 'score') {
		// Display winner
		var win_text = message.winning_player
		if(win_text != 'tie') {
			win_text += ' wins!'
		}
		else {
			win_text = 'Tie!'
		}
		document.getElementById('score-message').innerText = win_text
		document.getElementById('game').style.display = 'none';
	}
	else if(message.type == 'increment') {
		self.increment_element('other-player-score')
	}
}




function Game() {
	this.has_started = false
	this.player_word_map = [{}, {}]
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
			if(self.valid_event(event))
			self.start_move(cell, element)
		})
		element.addEventListener('touchmove', function(event) {
			if(self.valid_event(event))
			self.move(cell, element)
		})
		element.addEventListener('touchend', function(event) {
			if(self.valid_event(event))
			self.end_move(cell, element)
		})

		// Add Mouse Handlers
		element.addEventListener('mousedown', function(event) {
			if(self.valid_event(event))
			self.start_move(cell, element)
		})
		element.addEventListener('mousemove', function(event) {
			if(self.valid_event(event))
			self.move(cell, element)
		})
		element.addEventListener('mouseup', function(event) {
			if(self.valid_event(event))
			self.end_move(cell, element)
		})
	})
}

Game.prototype.valid_event = function(event) {
	var margin = 10
	var x = event.offsetX
	var y = event.offsetY

	// Handle touch events
	if(!x || !y) {
		// http://stackoverflow.com/questions/17130940/retrieve-the-same-offsetx-on-touch-like-mouse-event
		if(!event.target || !event.targetTouches) return false;
		var rect = event.target.getBoundingClientRect();
		x = event.targetTouches[0].pageX - rect.left;
		y = event.targetTouches[0].pageY - rect.top;
	}

	if(x > margin &&
		x < 80 - margin &&
		y > margin &&
		y < 80 - margin)
	{
		return true
	}
	return false
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

// Computes the score for each player
Game.prototype.compute_scores = function() {
	var score_list = []
	var word_list_list = []
	for(var i = 0; i < this.client_list.length; i++) {
		var client = this.client_list[i]
		var word_map = this.player_word_map[i]
		var word_list = Object.keys(word_map)
		word_list_list.push(word_list)
		var player_score = 0
		for(var j = 0; j < word_list.length; j++) {
			var word = word_list[j]
			var score = word.length - 3
			player_score += score
		}
		score_list.push(player_score)
	}

	var winning_player = 'tie'
	if(score_list[0] < score_list[1]) {
		winning_player = this.client_list[1].name
	}
	else if(score_list[0] > score_list[1]) {
		winning_player = this.client_list[0].name
	}

	var score_message = {
		type: 'score',
		score_list: score_list,
		word_list_list: word_list_list,
		winning_player: winning_player,
	}
	return score_message
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
		if(word.length > 3) {
			Game.trie.add(word)
		}
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

function Player() {

}

function start_server() {
	server = new Server()
	server.start()
}

function algorithm_test() {
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
