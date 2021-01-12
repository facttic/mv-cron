# mv-cron

- CRON para levantar TW e IG con imagen y determinados hash.

## Restore de BBDD

- Para utilizar una BBDD modelo (tiene tweets de ejemplo y la iremos actualizando), se puede usar el backup que está en la carpeta `/dbdump`.
  - Ir a la carpeta y ejecutar el comando mongorestore con las opciones que correspondan, [sin corchetes]: `mongorestore --db [db_name] --port [mongo_PORT] [--authenticationDatabase auth_db_name_if_needed --username my_user_if_needed --password "my_password_if_needed"] --archive=24m.2020-03-21.gz --gzip`

## .env

- Usamos `dotenv` para levantar la configuración de un archivo `.env`.
- Se puede tomar el archivo `.env-example` de base.
  - TWITTER_CRON_ACTIVE=indicar `true` para configurar si esta instancia va a levantar tweets. Opcional. Default=false.
  - TWITTER_CRAWLER_MAX_TWEETS=cantidad de tweets total a obtener al llenar BBDD la 1era vez. Opcional. Default: 1400.
  - TWITTER_CRAWLER_MAX_TWEETS_PER_QUERY=Cantidad de tweets a obtener en cada llamada a la API de twitter. Opcional. Default: 100.
  - TWITTER_CRON_TIMELAPSE=tiempo en minutos entre llamads a la API de twitter. Opcional. Default: 5 (minutos).
  - TWITTER_CONSUMER_KEY=accesos a Twitter API.
  - TWITTER_CONSUMER_SECRET=accesos a Twitter API.
  - TWITTER_ACCESS_TOKEN_KEY=accesos a Twitter API.
  - TWITTER_ACCESS_TOKEN_SECRET=accesos a Twitter API.

## Ejecutar

- `npm i`. Instalar dependencias.
- `npm start`. Correr con nodemon (hotreload).

## Acceso a API de Twitter

[Acá](https://elfsight.com/blog/2020/03/how-to-get-twitter-api-key/) encontré un tutorial para obtener keys y acceder a la API de Twitter. Yo tenía keys que había pedido hace un tiempo. Está la posibilidad de que ahora el proceso sea más complejo. Puedo compartir mis keys, pero tenemos que ser cuidadosxs de no saturar la cuota.
