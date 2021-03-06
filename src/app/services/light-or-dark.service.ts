import { Injectable } from '@angular/core';
import * as tf from '@tensorflow/tfjs';
import * as tinycolor from 'tinycolor2';

export interface TrainingData {
  input: RGB;
  output?: {
    light?: number;
    dark?: number;
  };
}

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export enum TrainingStage {
  InProcess,
  Compleated,
}

export interface TrainingProcess {
  stage: TrainingStage;
  loss: number;
}

@Injectable()
export class LightOrDarkService {
  private model: tf.Sequential;
  private learningRate = 0.1;

  public async load() {
    this.model = tf.sequential();
    this.model.add(
      tf.layers.dense({
        units: 16,
        inputDim: 3,
        activation: 'relu',
      }),
    );

    this.model.add(
      tf.layers.dense({
        units: 16,
        activation: 'relu',
      }),
    );

    this.model.add(tf.layers.dense({ units: 2, activation: 'softmax' }));

    const modelOptimizer = tf.train.sgd(this.learningRate);

    this.model.compile({
      loss: 'categoricalCrossentropy',
      optimizer: modelOptimizer,
      metrics: ['accuracy'],
    });
  }

  public async guess(color: RGB) {
    const xs = tf.tensor2d([
      [
        this.mapFromRbg(color.r),
        this.mapFromRbg(color.g),
        this.mapFromRbg(color.b),
      ],
    ]);

    const results = this.model.predict(xs) as tf.Tensor;

    const data = await results.argMax(1).data();

    return data[0] === 1;
  }

  public async guessList(color: string[]): Promise<number[]> {
    const xs = tf.tensor2d(
      color.map(x => {
        const c = tinycolor(x).toRgb();
        return [
          this.mapFromRbg(c.r),
          this.mapFromRbg(c.g),
          this.mapFromRbg(c.b),
        ];
      }),
    );

    const results = this.model.predict(xs) as tf.Tensor;

    const data = await results.argMax(1).data();

    const out: number[] = [];
    (data as Int32Array).forEach(x => {
      out.push(x);
    });

    return Promise.resolve(out);
  }

  public async train(
    epochs: number,
    trainData: TrainingData[],
    callback: (epoch: number, logs: tf.Logs) => void,
  ) {
    if (trainData.length === 0) {
      return;
    }

    // tf.tidy(() => {
    const colors = trainData.map(x => {
      return [
        this.mapFromRbg(x.input.r),
        this.mapFromRbg(x.input.g),
        this.mapFromRbg(x.input.r),
      ];
    });

    const labels = trainData.map(x => {
      return x.output.dark ? 0 : 1;
    });

    const xs = tf.tensor2d(colors);

    const labels_ts = tf.tensor1d(labels, 'int32');

    const ys = tf.oneHot(labels_ts, 2);

    labels_ts.dispose();

    xs.print();
    ys.print();

    const sampleRate = epochs > 10 ? Math.floor(epochs / 10) : 1;

    const configCallbacks: tf.CustomCallbackConfig = {
      onBatchEnd: tf.nextFrame,
      onTrainBegin: tf.nextFrame,
      onTrainEnd: tf.nextFrame,
      onEpochEnd: (epoch: number, logs: tf.Logs) => {
        if (epoch % sampleRate === 0) {
          callback(epoch, logs);
        }
        return Promise.resolve();
      },
    };

    const config: tf.ModelFitConfig = {
      epochs,
      shuffle: true,
      callbacks: configCallbacks,
    };

    return this.model.fit(xs, ys, config);
  }

  public mapFromRbg(input: number) {
    return this.map(input, 0, 255, 0, 1);
    // return input;
  }

  private map(
    input: number,
    in_min: number,
    in_max: number,
    out_min: number,
    out_max: number,
  ): number {
    return (
      ((input - in_min) * (out_max - out_min)) / (in_max - in_min) + out_min
    );
  }
}
