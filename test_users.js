const { loadBaseColaboradores } = require('./server/auth.js');
const base = loadBaseColaboradores();
const lines = [11814, 13887, 33, 432, 8131, 8401, 9379, 10935, 11118];
lines.forEach(l => {
  const user = base[l - 2];
  if(user) {
    console.log('Linha ' + l + ': ' + user._nome + ' - ' + user._email + ' - ' + user.cargo);
  } else {
    console.log('Linha ' + l + ': NÃO ENCONTRADO');
  }
});
