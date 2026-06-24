import pandas as pd

df = pd.read_excel('temp_copy.xlsx')

# Check missing
missing_matricula = df[df['Matricula'].isna()]
missing_email = df[df['E-mail'].isna()]

# Check trailing/leading spaces
df['E-mail_clean'] = df['E-mail'].astype(str).str.strip()
email_spaces = df[df['E-mail'].astype(str) != df['E-mail_clean']]
df['Nome_clean'] = df['Nome Funcionário'].astype(str).str.strip()
nome_spaces = df[df['Nome Funcionário'].astype(str) != df['Nome_clean']]

# Check duplicates
dup_matricula = df[df.duplicated('Matricula', keep=False)]
dup_email = df[df.duplicated('E-mail_clean', keep=False)]

print('Missing Matricula:', len(missing_matricula))
print('Missing E-mail:', len(missing_email))
print('Emails with spaces:', email_spaces[['Matricula', 'E-mail']].to_dict(orient='records'))
print('Names with spaces:', len(nome_spaces))

print('\nDuplicate Matriculas:', dup_matricula['Matricula'].unique())
print('\nDuplicate Emails (clean):')
for email, group in dup_email.groupby('E-mail_clean'):
    print(f"{email}: {group['Matricula'].tolist()}")
