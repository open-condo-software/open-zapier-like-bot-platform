# Dynamic configuration telegram BOT

This example is a starting point to understanding what's going on here!

# HowTo run

1) create a telegram bot token by talking with https://t.me/BotFather
2) create `.env` file with the token like so:
```
TELEGRAM_TOKEN=569608342:AAGindD9m0nsRR0PJEAHIz0pqWG2VOIi46A
```

3) run `yarn` to install the requirements and then run `yarn start`

4) you can talk to your bot! and send `rules.json` files to him!

# rules.json

This example has only `telegram` controller. And you can use only telegram based rules.

Examples:

 - if someone sends a message `hi` to the bot private messages you want to answer `HI! You can config me by 'rules.json' file`
 - if someone sends a message like `"*alarm*"` to any chat the bot should send my private message `ALARM! ALARM! Lok at the chat {{ chat_name }}`

The `rules.json` file for that examples:

```json
[
  {
    "controller": "telegram",
    "when": "message",
    "case": "{{ r/(hi|hello|\\/start)/ig.test(text) and chat.type == \"private\" }}",
    "do": [
      {
        "controller": "telegram",
        "action": "sendMessage",
        "args": {
          "chatId": "{{ chat.id }}",
          "text": "HI! You can config me by `rules.json` file"
        }
      }
    ]
  }
]
```

```json
[
  {
    "controller": "telegram",
    "when": "message",
    "case": "{{ r/(alarm)/ig.test(text) }}",
    "do": [
      {
        "controller": "telegram",
        "action": "sendMessage",
        "args": {
          "chatId": "-744812726",
          "text": "ALARM! ALARM! Lok at the chat {{ chat.name }}"
        }
      }
    ]
  }
]
```

Done! You already know how to create dynamic configurable bot.

But your bot just store their state in memory, and probably you don't want to lose it after restart. 
Check the next example to find a way to fix it!