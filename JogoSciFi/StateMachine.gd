extends Node
class_name StateMachine

var current_state: Node = null

func _ready():
	# Começa com o primeiro estado filho (no caso, StateMoto)
	if get_child_count() > 0:
		change_state(get_child(0).name)

func change_state(new_state_name: String):
	if current_state != null:
		if current_state.has_method("exit_state"):
			current_state.exit_state()
		
	var next_state = get_node_or_null(new_state_name)
	if next_state != null:
		current_state = next_state
		if current_state.has_method("enter_state"):
			current_state.enter_state()
	else:
		print("ERRO: Estado não encontrado -> ", new_state_name)

func update_state(delta: float):
	if current_state != null and current_state.has_method("process_state"):
		current_state.process_state(delta)
