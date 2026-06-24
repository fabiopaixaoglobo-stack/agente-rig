extends Node3D

# --- GERENCIAMENTO DE TEMPO E FASES ---
var time_elapsed: float = 0.0
# Cada fase dura 5 minutos (300 segundos). Total = 15 minutos.
var phase_duration: float = 300.0 
var current_phase: int = 1

# Referência à máquina de estados do jogador
@onready var player_state_machine = get_node("../Player/StateMachine")

# --- SPAWNER INFINITO ---
var spawn_z: float = -50.0 
var spawn_distance: float = 20.0 # Distância entre os blocos ou inimigos
@onready var player = get_node("../Player")

func _process(delta):
	manage_phases(delta)
	manage_spawning()

# 1. Lógica de Transição Baseada em Tempo (5 minutos por fase)
func manage_phases(delta: float):
	time_elapsed += delta
	
	if current_phase == 1 and time_elapsed >= phase_duration: # Passou 5 min
		current_phase = 2
		print("===== MUDANÇA DE FASE: 2 (NINJA) =====")
		player_state_machine.change_state("StateNinja")
		
	elif current_phase == 2 and time_elapsed >= (phase_duration * 2): # Passou 10 min totais
		current_phase = 3
		print("===== MUDANÇA DE FASE: 3 (NAVE) =====")
		player_state_machine.change_state("StateNave")

# 2. Lógica de Geração Infinita
func manage_spawning():
	var player_z = player.position.z
	
	# Se o jogador se aproximar muito do limite gerado, cria mais pista/obstáculos
	if player_z - 60 < spawn_z:
		spawn_obstacle()

func spawn_obstacle():
	var track_width = 3.0
	var random_track = randi_range(-1, 1) # Escolhe Pista Esquerda, Centro ou Direita
	var obstacle_pos = Vector3(random_track * track_width, 0, spawn_z)
	
	# Aqui você faria o instantiate de uma Cena real de obstáculo da sua lista
	# var obstacle = obstacle_scene.instantiate()
	# add_child(obstacle)
	# obstacle.position = obstacle_pos
	
	print("[SPAWN] Obstáculo da Fase ", current_phase, " criado na pista ", random_track, " em Z: ", spawn_z)
	
	spawn_z -= spawn_distance # Avança a geração para a frente
