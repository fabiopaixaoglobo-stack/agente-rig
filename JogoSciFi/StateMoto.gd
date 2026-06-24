extends Node

@onready var player = get_parent().get_parent() # Acessa o Player

func enter_state():
	print(">>> ENTRANDO NO ESTADO: MOTO (Fase 1)")
	# Dica: Aqui você ativaria a visibilidade do modelo 3D da Moto no Player

func process_state(delta):
	# Controles de Movimento lateral
	if Input.is_action_just_pressed("ui_left"):
		player.move_left()
	elif Input.is_action_just_pressed("ui_right"):
		player.move_right()
		
	# Pulo simples da Moto (Cima)
	if Input.is_action_just_pressed("ui_up") and player.is_on_floor():
		player.velocity.y = 10.0 # Força do pulo
		print("Moto Pulou!")
		
	# Ataque Laser Frontal (Espaço/Enter)
	if Input.is_action_just_pressed("ui_accept"):
		fire_laser()

func fire_laser():
	print("[MOTO] PEW PEW! Tiro Laser disparado para destruir barreiras!")
	# Aqui seria instanciado um objeto de tiro (Projétil) para frente

func exit_state():
	print("<<< SAINDO DO ESTADO: MOTO")
