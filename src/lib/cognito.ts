/* ---------------------------------------------------------------------------
   Cliente de Amazon Cognito — User Pools, sin SDK.

   Por qué sin SDK: `amazon-cognito-identity-js` (o Amplify) sumaría cientos de
   KB al bundle para usar UNA operación. InitiateAuth es un POST JSON al
   endpoint regional del servicio, así que acá va escrito a mano y tipado.

   Flujo elegido: USER_PASSWORD_AUTH (el app client lo tiene habilitado).
   - La contraseña viaja por TLS al endpoint de Cognito, nunca a nuestro backend,
     y nuestros servicios no la ven jamás.
   - El ideal es SRP (la contraseña no sale del navegador) o Authorization Code
     + PKCE con Hosted UI; las dos necesitan piezas que no caben en esta
     entrega (SRP una librería de criptografía, Hosted UI un dominio y una URL
     de retorno por entorno). Queda anotado como la mejora siguiente.

   Qué token se usa y por qué el ID token:
   el contrato §12 dice que `usuarioId` es el email. El ID token trae `email`,
   `name` y `cognito:groups`; el access token de Cognito NO trae el email. El
   authorizer del API Gateway acepta cualquiera de los dos y mapea
   `context.authorizer.claims.email` a la cabecera X-Usuario-Id, así que el
   navegador manda el ID token.
   ------------------------------------------------------------------------- */
import { COGNITO } from '../config'

const OBJETIVO = 'AWSCognitoIdentityProviderService'

export type Tokens = {
  idToken: string
  accessToken: string
  refreshToken: string | null
  /** Epoch en milisegundos en que el ID token deja de valer. */
  expiraEn: number
}

export type Claims = {
  email: string
  name?: string
  'cognito:groups'?: string[]
  exp: number
}

export class ErrorCognito extends Error {
  /* Campo declarado y asignado a mano: el proyecto compila con
     erasableSyntaxOnly, que prohíbe los parámetros-propiedad del constructor. */
  readonly tipo: string

  constructor(tipo: string, mensaje: string) {
    super(mensaje)
    this.tipo = tipo
  }
}

/** Mensajes en español; los de Cognito llegan en inglés y son para el log. */
const MENSAJES: Record<string, string> = {
  NotAuthorizedException: 'Correo o contraseña incorrectos.',
  UserNotFoundException: 'Correo o contraseña incorrectos.',
  UserNotConfirmedException: 'La cuenta todavía no está confirmada.',
  PasswordResetRequiredException: 'Hay que restablecer la contraseña de esta cuenta.',
  TooManyRequestsException: 'Demasiados intentos. Espera unos segundos.',
  LimitExceededException: 'Demasiados intentos. Espera unos segundos.',
  InvalidParameterException: 'Revisa el correo y la contraseña.',
  ResourceNotFoundException: 'La configuración de Cognito no es válida (user pool o cliente).',
  /* Registro */
  UsernameExistsException: 'Ya existe una cuenta con ese correo. Inicia sesión.',
  InvalidPasswordException: 'La contraseña no cumple el mínimo: 10 caracteres, con mayúscula, minúscula y número.',
  CodeDeliveryFailureException: 'No se pudo enviar el correo de verificación.',
}

/** El tipo llega como "...#NotAuthorizedException" o en el campo __type. */
function tipoDeError(cuerpo: unknown, estado: number): string {
  const c = cuerpo as { __type?: string; message?: string } | null
  const crudo = c?.__type ?? ''
  const tipo = crudo.includes('#') ? crudo.split('#')[1] : crudo
  return tipo || `HTTP${estado}`
}

async function llamar<T>(operacion: string, carga: unknown): Promise<T> {
  if (!COGNITO.clientId) {
    throw new ErrorCognito('SinConfigurar', 'La tienda no tiene configurado Cognito (COGNITO_CLIENT_ID).')
  }
  let res: Response
  try {
    res = await fetch(`https://cognito-idp.${COGNITO.region}.amazonaws.com/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': `${OBJETIVO}.${operacion}`,
      },
      body: JSON.stringify(carga),
      signal: AbortSignal.timeout(15000),
    })
  } catch {
    throw new ErrorCognito('Red', 'No se pudo contactar el servicio de identidad.')
  }
  const texto = await res.text()
  const cuerpo = texto ? (JSON.parse(texto) as unknown) : null
  if (!res.ok) {
    const tipo = tipoDeError(cuerpo, res.status)
    throw new ErrorCognito(tipo, MENSAJES[tipo] ?? 'No se pudo iniciar sesión.')
  }
  return cuerpo as T
}

type RespuestaAuth = {
  AuthenticationResult?: {
    IdToken: string
    AccessToken: string
    RefreshToken?: string
    ExpiresIn: number
  }
  ChallengeName?: string
}

function tokensDe(r: RespuestaAuth, refrescoPrevio: string | null = null): Tokens {
  if (!r.AuthenticationResult) {
    /* Pasa, por ejemplo, con una contraseña temporal: Cognito responde
       NEW_PASSWORD_REQUIRED en vez de tokens. Se dice qué pasó en vez de
       fallar con "undefined". */
    throw new ErrorCognito(r.ChallengeName ?? 'SinTokens', 'La cuenta requiere un paso extra en Cognito: ' + (r.ChallengeName ?? 'desconocido'))
  }
  const a = r.AuthenticationResult
  return {
    idToken: a.IdToken,
    accessToken: a.AccessToken,
    refreshToken: a.RefreshToken ?? refrescoPrevio,
    expiraEn: Date.now() + a.ExpiresIn * 1000,
  }
}

export async function autenticar(email: string, clave: string): Promise<Tokens> {
  const r = await llamar<RespuestaAuth>('InitiateAuth', {
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: COGNITO.clientId,
    AuthParameters: { USERNAME: email, PASSWORD: clave },
  })
  return tokensDe(r)
}

type RespuestaRegistro = { UserConfirmed?: boolean; UserSub?: string }

/* Crea la cuenta en el user pool.

   La cuenta queda CONFIRMADA al instante por un trigger PreSignUp
   (`despliegue/18-cognito-registro.sh`): en el Learner Lab no hay servidor de
   correo, así que el código de verificación que Cognito manda nunca llegaría y
   el usuario quedaría sin poder entrar. `confirmada` se devuelve para que la
   pantalla no prometa un inicio de sesión automático si algún día el trigger
   no está y hace falta el código. */
export async function registrar(email: string, clave: string, nombre: string): Promise<{ confirmada: boolean }> {
  const r = await llamar<RespuestaRegistro>('SignUp', {
    ClientId: COGNITO.clientId,
    Username: email,
    Password: clave,
    UserAttributes: [
      { Name: 'email', Value: email },
      ...(nombre.trim() ? [{ Name: 'name', Value: nombre.trim() }] : []),
    ],
  })
  return { confirmada: r.UserConfirmed === true }
}

/** Renueva el ID token sin volver a pedir la contraseña. */
export async function refrescar(refreshToken: string): Promise<Tokens> {
  const r = await llamar<RespuestaAuth>('InitiateAuth', {
    AuthFlow: 'REFRESH_TOKEN_AUTH',
    ClientId: COGNITO.clientId,
    AuthParameters: { REFRESH_TOKEN: refreshToken },
  })
  return tokensDe(r, refreshToken)
}

/* Lectura de claims SIN validar la firma, a propósito: acá sólo sirven para
   pintar el nombre y decidir qué menú mostrar. Quien valida de verdad es el
   authorizer del API Gateway, que comprueba firma, emisor y expiración contra
   el JWKS del user pool antes de que la petición llegue a la EC2. */
export function claimsDe(idToken: string): Claims | null {
  try {
    const carga = idToken.split('.')[1]
    const json = atob(carga.replace(/-/g, '+').replace(/_/g, '/'))
    const c = JSON.parse(decodeURIComponent(escape(json))) as Claims
    return typeof c.email === 'string' && typeof c.exp === 'number' ? c : null
  } catch {
    return null
  }
}

export const vencido = (t: Tokens, margenMs = 60_000) => Date.now() + margenMs >= t.expiraEn
