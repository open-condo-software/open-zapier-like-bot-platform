# ozyifttt

It's open source alternative to services like: 
[integrately](https://integrately.com/), 
[ifttt](https://ifttt.com/), 
[zapier](https://zapier.com/), 
[n8n](https://n8n.io/)

You can use this library to create NO CODE telegram bots. 
The idea is similar to ifttt/zapier solutions.

Currently, it's support: `telegram`, `github`, `jira`

We use it to create a dev team easy customizable telegram bot without code!
Every team made can create their own rules like so:

 - if `github`:`create new repo` write message to chat
 - if `github`:`open a new pull request` write message to chat
 - if `github`:`new comment like "deploy"` execute some command
 - if `jira`:`issue status changed to "Ready for test"` write private message to username
 - if `telegram`:`any chat have message like "*alarm*"` write three private messages to username
 - and so on

All this rules is dynamic, you don't need to redeploy or restart your bot. You need just send the `rules.json` file
to your dev team telegram bot and then all your rules will be applied without any restart/redeploy/CI/CD.

It's try by examples. Look at [examples](./examples) folder.

# examples

 1) [Minimal example](./examples/01-simple-bot): A simple bot. You can set the responding rules for telegram messages by json file.
 2) TODO
