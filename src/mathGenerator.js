/**
 * Math Defense: Kingdom Siege - Math Equation Generator
 * Generates solvable equations with positive integer results.
 */

const MathGenerator = {
  /**
   * Generates an equation based on the enemy type / level.
   * @param {string} type - 'slime', 'goblin', 'dragon', or 'boss'
   * @param {string} difficulty - 'easy', 'medium', 'hard' (affects range limits)
   * @returns {{ question: string, answer: number }}
   */
  generate(type, difficulty = 'medium') {
    switch (type.toLowerCase()) {
      case 'slime':
        return this.generateSlime(difficulty);
      case 'goblin':
        return this.generateGoblin(difficulty);
      case 'dragon':
        return this.generateDragon(difficulty);
      case 'boss':
        return this.generateBoss(difficulty);
      default:
        return this.generateSlime(difficulty);
    }
  },

  /**
   * Level 1: Slime - Addition & Subtraction
   */
  generateSlime(difficulty) {
    const isAddition = Math.random() > 0.5;
    let maxNum = 20;
    if (difficulty === 'medium') maxNum = 50;
    if (difficulty === 'hard') maxNum = 100;

    if (isAddition) {
      const a = Math.floor(Math.random() * (maxNum - 2)) + 2;
      const b = Math.floor(Math.random() * (maxNum - 2)) + 2;
      return {
        question: `${a} + ${b}`,
        answer: a + b
      };
    } else {
      const a = Math.floor(Math.random() * (maxNum - 5)) + 6;
      const b = Math.floor(Math.random() * (a - 2)) + 2; // Keep result positive and > 1
      return {
        question: `${a} - ${b}`,
        answer: a - b
      };
    }
  },

  /**
   * Level 2: Goblin - Multiplication & Division
   */
  generateGoblin(difficulty) {
    const isMultiplication = Math.random() > 0.5;
    let maxFactor = 10;
    if (difficulty === 'medium') maxFactor = 12;
    if (difficulty === 'hard') maxFactor = 15;

    if (isMultiplication) {
      const a = Math.floor(Math.random() * (maxFactor - 1)) + 2;
      const b = Math.floor(Math.random() * 9) + 2; // multiplier between 2 and 10
      return {
        question: `${a} × ${b}`,
        answer: a * b
      };
    } else {
      const divisor = Math.floor(Math.random() * (maxFactor - 2)) + 2;
      const answer = Math.floor(Math.random() * 9) + 2; // quotient
      const dividend = divisor * answer;
      return {
        question: `${dividend} ÷ ${divisor}`,
        answer: answer
      };
    }
  },

  /**
   * Level 3: Dragon - Parentheses, Powers & Percentages
   */
  generateDragon(difficulty) {
    const r = Math.random();
    
    if (r < 0.35) {
      // 1. Parentheses: A * (B + C) or (A - B) * C
      const isAdd = Math.random() > 0.5;
      if (isAdd) {
        const a = Math.floor(Math.random() * 4) + 2; // 2..5
        const b = Math.floor(Math.random() * 5) + 1; // 1..5
        const c = Math.floor(Math.random() * 5) + 1; // 1..5
        return {
          question: `${a} × (${b} + ${c})`,
          answer: a * (b + c)
        };
      } else {
        const a = Math.floor(Math.random() * 8) + 6; // 6..13
        const b = Math.floor(Math.random() * (a - 3)) + 2; // 2..(a-2)
        const c = Math.floor(Math.random() * 4) + 2; // 2..5
        return {
          question: `(${a} - ${b}) × ${c}`,
          answer: (a - b) * c
        };
      }
    } else if (r < 0.7) {
      // 2. Powers (Exponents): A² or A³
      const isCube = Math.random() > 0.75; // cube is less common
      if (isCube) {
        const a = Math.floor(Math.random() * 4) + 2; // 2..5
        return {
          question: `${a}³`,
          answer: Math.pow(a, 3)
        };
      } else {
        let maxBase = 10;
        if (difficulty === 'medium') maxBase = 12;
        if (difficulty === 'hard') maxBase = 15;
        const a = Math.floor(Math.random() * (maxBase - 1)) + 2; // 2..maxBase
        return {
          question: `${a}²`,
          answer: Math.pow(a, 2)
        };
      }
    } else {
      // 3. Percentages: P% of Y
      // We choose common percentages: 10%, 20%, 25%, 50%, 75%
      const percentages = [10, 20, 25, 50, 75];
      const p = percentages[Math.floor(Math.random() * percentages.length)];
      let y = 100;
      
      switch (p) {
        case 50: // half
          y = (Math.floor(Math.random() * 19) + 1) * 10; // 10, 20, ..., 190
          break;
        case 10: // tenth
          y = (Math.floor(Math.random() * 29) + 2) * 10; // 20, 30, ..., 300
          break;
        case 20: // fifth
          y = (Math.floor(Math.random() * 19) + 1) * 10; // 10, 20, ..., 190 (which is mult of 5)
          break;
        case 25: // quarter
          y = (Math.floor(Math.random() * 12) + 1) * 20; // 20, 40, ..., 240
          break;
        case 75: // three quarters
          y = (Math.floor(Math.random() * 6) + 1) * 40; // 40, 80, ..., 240
          break;
      }
      
      const answer = (p / 100) * y;
      return {
        question: `${p}% de ${y}`,
        answer: answer
      };
    }
  },

  /**
   * Level 4: Boss - 1st Degree Equations
   */
  generateBoss(difficulty) {
    const r = Math.random();
    
    if (r < 0.4) {
      // Ax + B = C
      const x = Math.floor(Math.random() * 9) + 2; // 2..10 (the answer)
      const a = Math.floor(Math.random() * 5) + 2; // 2..6
      const b = Math.floor(Math.random() * 12) + 1; // 1..12
      const c = a * x + b;
      return {
        question: `${a}x + ${b} = ${c}`,
        answer: x
      };
    } else if (r < 0.8) {
      // Ax - B = C (ensure C > 0)
      const x = Math.floor(Math.random() * 9) + 2; // 2..10 (the answer)
      const a = Math.floor(Math.random() * 5) + 2; // 2..6
      const maxB = a * x - 1; // Ensure C = Ax - B > 0
      const b = Math.floor(Math.random() * Math.min(maxB, 12)) + 1; // 1..min(maxB, 12)
      const c = a * x - b;
      return {
        question: `${a}x - ${b} = ${c}`,
        answer: x
      };
    } else {
      // x / A + B = C
      // answer x must be multiple of A
      const divisor = Math.floor(Math.random() * 3) + 2; // 2..4
      const xTermValue = Math.floor(Math.random() * 6) + 2; // x / divisor = 2..7
      const x = divisor * xTermValue; // the answer
      const b = Math.floor(Math.random() * 9) + 1; // 1..9
      const c = xTermValue + b;
      
      return {
        question: `x/${divisor} + ${b} = ${c}`,
        answer: x
      };
    }
  }
};

// Export to work in both ES6 modules and global browser scope
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MathGenerator;
} else {
  window.MathGenerator = MathGenerator;
}
