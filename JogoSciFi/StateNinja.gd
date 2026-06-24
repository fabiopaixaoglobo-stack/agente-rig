extends Node

@onready var player = get_parent().get_parent()

func enter_state():
	print(">>> ENTRANDO NO ESTADO: NINJA A PÉ (Fase 2)")
	# Dica: Ocultaria a Moto e mostraria o modelo do Ninja correndo

func process_state(delta):
	# Controles de Movimento lateral mantidos
	if Input.is_action_just_pressed("ui_left"):
		player.move_left()
	elif Input.is_action_just_pressed("ui_right"):
		player.move_right()
		
	# Ninja também pode pular
	if Input.is_action_just_pressed("ui_up") and player.is_on_floor():
		player.velocity.y = 12.0 # Ninja pula mais alto que a moto
		print("Ninja Pulou!")

	# Ataque Contextual (Corpo-a-corpo vs Longa distância)
	if Input.is_action_just_pressed("ui_accept"):
		if is_enemy_near():
			melee_attack()
		else:
			ranged_attack()

func is_enemy_near() -> bool:
	# Lógica real usaria um RayCast3D ou Area3D. Aqui usamos probabilidade p/ simular.
	var dist_simulada = randf()
	return dist_simulada > 0.5 # 50% de chance de ser ataque de perto no teste

func melee_attack():
	print("[NINJA] SWISH! Corte de Espada brutal de perto!")

func ranged_attack():
	print("[NINJA] ZAP! Tiro Longo lançado contra os Aliens!")

func exit_state():
	print("<<< SAINDO DO ESTADO: NINJA A PÉ")
