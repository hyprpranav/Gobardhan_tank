#define IN1 8
#define IN2 9
#define IN3 10
#define IN4 11

#define ENA 12
#define ENB 13

#define CONTROL_PIN 2

int delayTime = 5;

void stepMotor(int step) {
  switch (step) {
    case 0:
      digitalWrite(IN1, HIGH);
      digitalWrite(IN2, LOW);
      digitalWrite(IN3, HIGH);
      digitalWrite(IN4, LOW);
      break;

    case 1:
      digitalWrite(IN1, LOW);
      digitalWrite(IN2, HIGH);
      digitalWrite(IN3, HIGH);
      digitalWrite(IN4, LOW);
      break;

    case 2:
      digitalWrite(IN1, LOW);
      digitalWrite(IN2, HIGH);
      digitalWrite(IN3, LOW);
      digitalWrite(IN4, HIGH);
      break;

    case 3:
      digitalWrite(IN1, HIGH);
      digitalWrite(IN2, LOW);
      digitalWrite(IN3, LOW);
      digitalWrite(IN4, HIGH);
      break;
  }
}

void stopMotor() {
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW);
  digitalWrite(IN4, LOW);
}

void rotateClockwise(unsigned long duration) {
  unsigned long start = millis();
  int step = 0;

  while (millis() - start < duration) {

    if (digitalRead(CONTROL_PIN) == LOW) {
      stopMotor();
      return;
    }

    stepMotor(step);
    step = (step + 1) % 4;
    delay(delayTime);
  }

  stopMotor();
}

void rotateAnticlockwise(unsigned long duration) {
  unsigned long start = millis();
  int step = 3;

  while (millis() - start < duration) {

    if (digitalRead(CONTROL_PIN) == LOW) {
      stopMotor();
      return;
    }

    stepMotor(step);
    step--;
    if (step < 0) {
      step = 3;
    }

    delay(delayTime);
  }

  stopMotor();
}

void setup() {

  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT);
  pinMode(IN4, OUTPUT);

  pinMode(ENA, OUTPUT);
  pinMode(ENB, OUTPUT);

  pinMode(CONTROL_PIN, INPUT);

  digitalWrite(ENA, HIGH);
  digitalWrite(ENB, HIGH);

  stopMotor();
}

void loop() {

  if (digitalRead(CONTROL_PIN) == HIGH) {

    // CLOCKWISE - 5 seconds
    rotateClockwise(5000);

    // WAIT - 1 second
    if (digitalRead(CONTROL_PIN) == HIGH)
      delay(1000);

    // Check again
    if (digitalRead(CONTROL_PIN) == HIGH) {

      // ANTICLOCKWISE - 5 seconds
      rotateAnticlockwise(5000);

      // WAIT - 1 second
      if (digitalRead(CONTROL_PIN) == HIGH)
        delay(1000);
    }

  } else {
    stopMotor();
  }
}