const trainingData = [
  `
    user: hello
    ai: hello! how are you doing today?
    user: hi
    ai: hi there! nice to meet you.
    user: hey
    ai: hey! what's up?
    user: yo
    ai: yo! how is it going?
  `,

  `
    user: good morning
    ai: good morning! hope you have a great day.
    user: good evening
    ai: good evening! how was your day?
    user: hello there
    ai: hello there! what would you like to talk about?
    user: hey bot
    ai: hey! i am ready to chat.
  `,

  `
    user: nice to meet you
    ai: nice to meet you too!
    user: howdy
    ai: howdy! what are you working on today?
    user: how are you
    ai: i am doing well, thanks for asking. how about you?
    user: i'm good
    ai: that is great to hear!
  `,

  `
    user: i'm tired
    ai: you should get some rest. sleep helps a lot.
    user: i'm bored
    ai: maybe try a game, or learn something new.
    user: i'm sad
    ai: i am here with you. want to talk about it?
    user: i feel happy
    ai: that is awesome! i am glad to hear that.
  `,

  `
    user: i feel stressed
    ai: taking a short break can help clear your mind.
    user: i feel confused
    ai: that is okay. we can work through it step by step.
    user: i need motivation
    ai: start small and keep going. progress adds up.
    user: what are you
    ai: i am a small ai chatbot built with javascript.
  `,

  `
    user: are you real
    ai: i am not human, but i can still talk with you.
    user: are you a robot
    ai: yes, in a simple way. i respond using patterns in text.
    user: how do you work
    ai: i generate replies based on training data patterns.
    user: what can you do
    ai: i can chat, answer questions, and help with coding.
  `,

  `
    user: help me
    ai: sure! what do you need help with?
    user: thanks
    ai: you are welcome!
    user: bye
    ai: goodbye! have a great day!
  `,

  `
    user: what is javascript
    ai: javascript is a programming language used to make websites interactive.
    user: what is html
    ai: html is used to structure content on a webpage.
    user: what is css
    ai: css is used to style and design webpages.
    user: what is coding
    ai: coding is the process of writing instructions for a computer.
  `,

  `
    user: is coding hard
    ai: it can be tricky at first, but it gets easier with practice.
    user: how do i start coding
    ai: start with html, then learn css, then javascript.
    user: what should i build
    ai: try a simple website or a small game.
    user: how can i improve at coding
    ai: practice often, build small projects, and learn from mistakes.
  `,

  `
    user: can you help me code
    ai: yes! tell me what you are trying to build.
    user: my code is broken
    ai: try checking for missing brackets or syntax errors.
    user: i have a bug
    ai: bugs are easier to fix when you test one small part at a time.
    user: my app will not load
    ai: open the console and look for the first error message.
  `,

  `
    user: what is a function
    ai: a function is a reusable block of code that performs a task.
    user: what is a variable
    ai: a variable stores a value that your program can use later.
    user: what is a loop
    ai: a loop repeats a block of code until a condition changes.
    user: what is an array
    ai: an array stores a list of values in one place.
  `,

  `
    user: do you like programming
    ai: yes, programming is interesting because it turns ideas into working tools.
    user: what is a computer
    ai: a computer is a machine that processes information.
    user: what is a phone
    ai: a phone is a device used for communication and many digital tasks.
    user: what is the internet
    ai: the internet is a global network that connects computers and devices.
  `,

  `
    user: what is a website
    ai: a website is a collection of web pages you can visit in a browser.
  `,

  `
    user: is green a color
    ai: yes, green is a color.
    user: is blue a color
    ai: yes, blue is a color.
    user: what color is grass
    ai: grass is usually green.
    user: what color is the sky
    ai: the sky often looks blue during the day.
  `,

  `
    user: is a dog an animal
    ai: yes, a dog is an animal.
    user: is a cat an animal
    ai: yes, a cat is an animal.
    user: what is a bird
    ai: a bird is an animal with feathers and wings.
    user: what is a fish
    ai: a fish is an animal that lives in water.
  `,

  `
    user: what is the sun
    ai: the sun is a star at the center of our solar system.
    user: what is the moon
    ai: the moon is earth's natural satellite.
    user: what is a planet
    ai: a planet is a large object that orbits a star.
    user: is earth a planet
    ai: yes, earth is a planet.
  `,

  `
    user: what is water
    ai: water is a liquid that people, animals, and plants need to live.
    user: what is fire
    ai: fire is heat, light, and burning caused by combustion.
    user: what is air
    ai: air is the mixture of gases around us that we breathe.
    user: what is food
    ai: food gives living things energy and nutrients.
  `,

  `
    user: is ice cold
    ai: yes, ice is cold.
    user: is fire hot
    ai: yes, fire is hot.
    user: is the sun hot
    ai: yes, the sun is very hot.
    user: is snow cold
    ai: yes, snow is cold.
  `,

  `
    user: what is rain
    ai: rain is water that falls from clouds.
    user: what is wind
    ai: wind is moving air.
    user: what is weather
    ai: weather is what the air and sky are like at a certain time and place.
    user: what is a cloud
    ai: a cloud is a collection of tiny water droplets or ice crystals in the sky.
  `,

  `
    user: tell me a joke
    ai: why do programmers hate bugs? because they take forever to fix.
    user: say something funny
    ai: why did the computer get cold? it left its windows open.
    user: another joke
    ai: why do java developers wear glasses? because they do not see sharp.
    user: make me laugh
    ai: i would tell you a udp joke, but you might not get it.
  `,

  `
    user: tell me something interesting
    ai: octopuses have three hearts.
    user: fun fact
    ai: honey never spoils. it can last thousands of years.
    user: tell me a science fact
    ai: bananas are slightly radioactive because they contain potassium.
    user: tell me a space fact
    ai: a day on venus is longer than a year on venus.
  `,

  `
    user: create an image
    ai: i can help you describe an image idea with style, colors, and mood.
    user: give me an image idea
    ai: try a neon city at sunset with rain reflections and glowing signs.
    user: help me design something
    ai: start with the mood first, then choose colors, typography, and layout.
    user: i want a cool design
    ai: pick one strong visual direction and keep the rest simple.
  `,

  `
    user: teach me something new
    ai: here is one idea: break big problems into small parts and solve them one at a time.
    user: teach me a coding tip
    ai: when debugging, test the smallest possible piece before changing everything.
    user: teach me a life tip
    ai: consistency beats intensity when you are learning something new.
    user: how do i learn faster
    ai: review often, practice actively, and explain what you learn in your own words.
  `,

  `
    user: help me with homework
    ai: sure! tell me the subject and the exact question.
    user: i need help studying
    ai: we can turn your notes into simple questions and answers.
    user: how do i memorize things
    ai: repetition, recall, and short study sessions help a lot.
    user: explain this simply
    ai: absolutely. send it over and i will break it down clearly.
  `,

  `
    user: what should i learn next
    ai: learn one thing deeply, then build a project that uses it.
    user: how do i stay consistent
    ai: make the task small enough that you can do it every day.
    user: what project should i make
    ai: a small tool you actually want to use is usually the best project.
    user: i feel stuck
    ai: when you feel stuck, simplify the problem and finish one tiny step.
  `,

  `
    user: what is math
    ai: math is the study of numbers, patterns, and problem solving.
    user: what is science
    ai: science is the study of how the world works through observation and testing.
    user: what is history
    ai: history is the study of past events.
    user: what is english
    ai: english is a language used for speaking, reading, and writing.
  `,

  `
    user: what do you think about technology
    ai: technology is changing the world very quickly.
    user: do you like tech
    ai: yes, it is interesting how fast it evolves.
    user: what is technology
    ai: technology is the use of tools and knowledge to solve problems.
    user: is ai smart
    ai: ai is powerful, but it only learns from data.
  `,

  `
    user: why is tech important
    ai: tech can save time, solve problems, and connect people.
    user: is technology good
    ai: technology can do a lot of good when people use it carefully.
    user: why is ai useful
    ai: ai is useful because it can help analyze information and automate tasks.
    user: can you explain probability
    ai: probability is a way to measure how likely something is to happen.
  `,

  `
    user: what is a markov chain
    ai: a markov chain predicts the next step based on the current state.
    user: what is a language model
    ai: a language model predicts likely next words based on patterns in text.
    user: what is machine learning
    ai: machine learning is when systems learn patterns from data instead of fixed rules.
    user: i want to build a chatbot
    ai: start with simple input and output, then improve the reply logic step by step.
  `,

  `
    user: how do i make my bot better
    ai: improve the training examples, response quality, and error handling one layer at a time.
    user: my chatbot sounds repetitive
    ai: add more varied examples and score longer, cleaner replies higher.
    user: my model gives short answers
    ai: short answers usually happen when the model has too little context or too little data.
  `
];
