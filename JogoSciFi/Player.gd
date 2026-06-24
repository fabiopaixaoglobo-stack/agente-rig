extends CharacterBody3D

# --- VARIÁVEIS DE PISTA ---
enum Track { LEFT = -1, CENTER = 0, RIGHT = 1 }
var current_track: int = Track.CENTER
var track_width: float = 3.0 # Distância entre as pistas

# --- VELOCIDADE ---
var forward_speed: float = 15.0
var side_speed: float = 10.0

# --- REFERÊNCIA À MÁQUINA DE ESTADOS ---
# Presumimos que exista um nó filho chamado "StateMachine"
@onready var state_machine = $StateMachine

func _ready():
	print("Player Inicializado. Pista: Centro")

func _physics_process(delta):
	# Movimentação automática para frente (eixo Z negativo)
	velocity.z = -forward_speed
	
	# Transição suave entre as pistas (Interpolação no eixo X)
	var target_x = current_track * track_width
	position.x = move_toward(position.x, target_x, side_speed * delta)
	
	# Aplica gravidade se não estiver no chão
	if not is_on_floor():
		velocity.y -= 20.0 * delta
		
	move_and_slide()
	
	# Repassa o processamento de inputs para a máquina de estados
	if state_machine:
		state_machine.update_state(delta)

# --- CONTROLES DE PISTA (Chamados pelos estados) ---
func move_left():
	if current_track > Track.LEFT:
		current_track -= 1
		print("Mudou para a pista: ", current_track)

func move_right():
	if current_track < Track.RIGHT:
		current_track += 1
		print("Mudou para a pista: ", current_track)
