extends Node

@onready var player = get_parent().get_parent()

func enter_state():
	print(">>> ENTRANDO NO ESTADO: NAVE ESPACIAL (Fase 3)")
	# A nave voa, então ignoramos a gravidade colocando a velocidade Y fixa no centro
	player.position.y = 5.0 # Sobe o jogador para o espaço
	player.velocity.y = 0.0

func process_state(delta):
	# Controles de Movimento lateral apenas para desviar de asteroides
	if Input.is_action_just_pressed("ui_left"):
		player.move_left()
	elif Input.is_action_just_pressed("ui_right"):
		player.move_right()

	# Disparo contínuo de Plasma
	if Input.is_action_pressed("ui_accept"): # 'pressed' em vez de 'just_pressed' para metralhadora
		plasma_barrage()

func plasma_barrage():
	# Na prática você precisaria de um 'cooldown' (Timer) para não atirar 60x por segundo
	print("[NAVE] BZZZZT! Disparos contínuos de plasma!")

func exit_state():
	print("<<< SAINDO DO ESTADO: NAVE ESPACIAL")
