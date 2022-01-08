# ozyifttt

It's open source alternative to services like: 
[integrately](https://integrately.com/), 
[ifttt](https://ifttt.com/), 
[zapier](https://zapier.com/), 
[n8n](https://n8n.io/)

Currently, it's support: `telegram`, `github`, `jira`

You can add to you dev team easy customizable telegram bot. 
Every team made can create their own rules like so:

 - if `github`:`create new repo` write message to chat
 - if `github`:`open a new pull request` write message to chat
 - if `github`:`new comment like "deploy"` execute some command
 - if `jira`:`issue status changed to "Ready for test"` write private message to username
 - if `telegram`:`any chat have message like "*alarm*"` write three private messages to username
 - and so on

Look at [examples](./examples) folder.
