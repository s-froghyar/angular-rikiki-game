import { Bet, Round, Round1Result, RoundAPIResponse, RoundPlayer, RoundResult, RoundType } from '../../interfaces/round.interface';
import { Component, OnInit } from '@angular/core';
import { MatDialog, MatDialogConfig, MatDialogRef } from '@angular/material/dialog';
import { first, take, takeUntil } from 'rxjs/operators';

import { Animations } from '../../game-src/animations/animations';
import { BettingModalComponent } from '../../game-src/betting-modal/betting-modal.component';
import { Card } from '../../shared/models/card.model';
import { EdgeRoundModalComponent } from 'src/app/game-src/edge-round-modal/edge-round-modal.component';
import { GameService } from '../../services/game-service/game.service';
import { RoundResultModalComponent } from '../../game-src/round-result-modal/round-result-modal.component';
import { Subject } from 'rxjs';

const modalBaseConfig: MatDialogConfig = {
  width: '700px',
  panelClass: 'modal',
  hasBackdrop: false,
  disableClose: true,
  position: {
    top: '30vh'
  },
};

@Component({
  selector: 'doc-game-room',
  templateUrl: './game-room.component.html',
  styleUrls: ['./game-room.component.scss'],
  animations: [Animations.roundInit]
})
export class GameRoomComponent implements OnInit {
  animTrigger = 'initial';
  isAnimationDone = false;
  isLoading = true;

  cardOnTop: Card;
  rankedPlayers = [];
  currentRound = 1;
  currentHand: any;
  nextToPlay: RoundPlayer;

  userInfo = 'Look at the opponent hands, and make your bet!'; // <- still to do
  trumpoCard: Card;
  roundData: Round;
  scoreboardToggle = true;
  bettingOptions: number[];
  canPlay = false;
  currentRoundModalName = '';
  idPivot = 0;
  baseCard: any = {};
  numCardsPlayed = 0;
  roundType: RoundType;

  roundResultModalRef: MatDialogRef<RoundResultModalComponent>;

  userId: number;
  private bettingSubj = new Subject<any>();
  private playingSubj = new Subject<any>();
  constructor(
    public dialog: MatDialog,
    private readonly gameService: GameService,
  ) { }

  ngOnInit(): void {
    this.gameService.getCurrentRound().pipe(take(1)).subscribe(round => {
      this.initNextRound(round);
    });
  }
  justPlayedCard(card) {
    this.canPlay = false;
    this.cardOnTop = Object.assign({}, card);
  }
  // MODALS
  openFirstRoundModal(firstRoundData: any): void {
    const modalRef = this.dialog.open(EdgeRoundModalComponent, {
      ...modalBaseConfig,
      data: {
        ...this.roundData,
        firstRoundData
      }
    });
    modalRef.afterClosed().subscribe((roundFromModal) => {
      if (this.roundType === 'last') {

      }
      if (this.roundData.me.isHost) {
        this.gameService.initNextRound().pipe(take(1)).subscribe(round => {
          this.initNextRound(round);
        });
      } else {
        this.initNextRound(roundFromModal);
      }
    });
  }
  openBettingModal(isDealerRebet?: boolean): void {
    if (isDealerRebet) {
      this.userInfo = 'Dealer needs to change their bets!';
    } if (this.currentRound === 1) {
      this.userInfo = 'Look at the opponent hands, and make your bet!';
    } else {
      this.userInfo = `Make your bet! Trump: ${this.trumpoCard.suit}`;
    }
    const modalRef = this.dialog.open(BettingModalComponent, {
      ...modalBaseConfig,
      id: `round-bets-${isDealerRebet ? 'delear-rebet-' + this.idPivot : this.idPivot}`,
      data: {
        bettingOptions: this.bettingOptions
      }
    });
    modalRef.afterClosed().subscribe(bet => {
      this.roundData.me.bets.bet = bet;
      this.roundData.me.bets.bettingOptions = this.bettingOptions;
      this.gameService.makeBet(this.roundData.me.bets, this.userId, isDealerRebet);
    });
  }
  openRoundResultModal(roundBets: any[]): void {
    this.userInfo = 'Round has ended. Host needs to start the next round!';
    this.currentRoundModalName = `round-result-${this.idPivot}`;
    this.roundResultModalRef = this.dialog.open(RoundResultModalComponent, {
      ...modalBaseConfig,
      id: this.currentRoundModalName,
      data: { roundBets, currRound: this.currentRound, roundData: this.roundData }
    });

    this.roundResultModalRef.afterClosed().subscribe((roundFromModal) => {
      if (this.roundData.me.isHost) {
        this.gameService.initNextRound().pipe(take(1)).subscribe(round => {
          console.log('initNextRound', round);
          this.initNextRound(round);
        });
      } else {
        this.initNextRound(roundFromModal);
      }
    });
  }
  toggleScorePanel(): void {
    this.scoreboardToggle = !this.scoreboardToggle;
  }
  getUserRole(player: RoundPlayer): string {
    if (player.isFirst) {
      return 'First';
    } else if (player.isDealer) {
      return 'Dealer';
    } else {
      return 'None';
    }
  }
  // round init refactor needed cuz its pretty similar!!!
  private initNextRound(round: number): void {
    this.isLoading = true;
    this.idPivot++;
    this.initRoundAnimation();
    this.currentRound = round;
    // close all result modals
    this.gameService.initRound(round).pipe(take(1)).subscribe(response => {
      this.allocateRoundData(response);
      this.isLoading = false;

    });
  }
  private getRoundType(resp: RoundAPIResponse): RoundType {
    if (this.currentRound === 1) {
      return 'first';
    } else if (resp.isLastRound) {
      return 'last';
    } else {
      return 'normal';
    }
  }
  private allocateRoundData(response: RoundAPIResponse): void {
    this.roundType = this.getRoundType(response);
      switch (this.roundType) {
        case 'first':
          this.setUpRankedPlayers();
          this.currentHand = Array.from(this.roundData.myHand.firstRoundHand);
          break;
        case 'last':
          this.currentHand = Array.from(this.roundData.myHand.firstRoundHand);
          break;
        case 'normal':
          this.currentHand = Array.from(this.roundData.myHand.myHand.hand);
          break;
        default:
          console.warn('RoundType Warning: RoundType not recognised!');
          break;
    }
    this.roundData = response.roundData;
    this.trumpoCard = Object.assign({}, this.roundData.trumpCard);
    this.cardOnTop = null;
    this.bettingOptions = this.roundData.myBets.bettingOptions;
    this.initBettingListeners();
    this.isLoading = false;
  }

  private setUpRankedPlayers(): void {
    const others = this.roundData.players.map(playa => {
      return {
        name: playa.username,
        uniqueId: playa.uniqueId,
        points: 0
      };
    });
    this.rankedPlayers = [...others, { name: this.roundData.me.username, uniqueId: this.roundData.me.uniqueId, points: 0 }];
  }
  private initRoundAnimation(): void {
    this.isAnimationDone = false;
    this.animTrigger = this.animTrigger === 'initial' ? 'final' : 'initial';

    setTimeout(() => {
      this.isAnimationDone = true;
      this.openBettingModal();
    }, 2000);
  }
  private initBettingListeners(): void {
    console.log('initBettingListeners');
    this.bettingSubj = new Subject<any>();

    if (this.roundType !== 'normal') {
      this.listenForRound1();
    } else {
      this.listenForOthersMakingBet();
      this.listenForReveal();
    }
  }
  private initPlayingListeners(): void {
    this.playingSubj = new Subject<any>();

    this.listenForOthersPlayingCard();
    this.listenForHitWinner();
    this.listenForRoundEnd();
    // if ure first then enable playing
    if (this.roundData.me.isFirst) {
      this.canPlay = true;
    }
  }
  private listenForOthersMakingBet(): void {
    this.gameService.listenForPlayerMakingBet()
      .pipe(takeUntil(this.bettingSubj))
      .subscribe((playerBet: Bet) => {
        console.log('listenForOthersMakingBet', playerBet);
        const ind = this.roundData.players.findIndex(player => player.uniqueId === playerBet.uniqueId);
        if (ind > -1) {
          this.roundData.players[ind].status = 'Done!';
        }
      });
  }
  private listenForReveal(): void {
    this.gameService.listenForReveal()
      .pipe(
        takeUntil(this.bettingSubj)
      )
      .subscribe((response: RoundResult) => {
        console.log('listenForReveal', response);
        if (response.isDealerChangeNeeded) {
          this.userInfo = `Dealer needs to change their bet!`;
          if (this.roundData.me.isDealer) {
            this.bettingOptions = response.options;
            this.openBettingModal(true);
          }
        } else {
          const roundBets = response.roundBets;

          this.numCardsPlayed = 0;

          this.roundData.players.forEach(playa => playa.status = 'Waiting...');
          const firstInd = this.roundData.players.findIndex(playa => playa.isFirst);
          if (firstInd === -1) {
            this.userInfo = `It is Your turn!`;
          } else {
            this.userInfo = `It is ${this.roundData.players[firstInd].username}'s turn!`;
            this.roundData.players[firstInd].status = 'Playing card...';
          }

          this.roundData.players.forEach((_, ind, arr) => {
            const playerInd = roundBets.findIndex(bet => bet.uniqueId === _.uniqueId);
            this.roundData.players[ind].bets = Object.assign({}, roundBets[playerInd]);
          });
          this.bettingSubj.next();
          this.bettingSubj.complete();
          this.initPlayingListeners();
        }
      });
  }
  private listenForRound1(): void {
    this.gameService.listenForRound1Results()
      .pipe(takeUntil(this.bettingSubj))
      .subscribe((response: Round1Result) => {
        console.log('listenForRound1', response);
        if (response.isDealerChangeNeeded) {
          this.userInfo = `Dealer needs to change their bet!`;
          if (this.roundData.me.isDealer) {
            this.bettingOptions = response.options;
            this.openBettingModal(true);
          }
        } else {
          this.rankedPlayers.forEach(playa => {
            playa.points = response.firstRoundData.scoreboard.find(user => user.uniqueId === playa.uniqueId).points;
          });
          this.bettingSubj.next();
          this.bettingSubj.complete();
          this.openFirstRoundModal(response.firstRoundData);
        }
      });
  }
  private listenForOthersPlayingCard(): void {
    this.gameService.listenForOthersPlayingCard()
      .pipe(takeUntil(this.playingSubj))
      .subscribe(data => {
        console.log('listenForOthersPlayingCard', data);

        if (this.numCardsPlayed === 0) {
          this.baseCard = Object.assign({}, data.card);
        }
        // card and nextId should come
        // update top card
        this.cardOnTop = Object.assign({}, data.card);
        this.roundData.players.forEach(playa => playa.status = 'Waiting...');
        // let player play card if its their nextId
        if (this.userId === data.nextId) {
          this.canPlay = true;
          this.userInfo = `It is Your turn!`;
          // get available cards
        } else {
          this.canPlay = false;
          const nextToPlay = this.roundData.players.findIndex(playa => playa.uniqueId === data.nextId);
          this.userInfo = `It is ${this.roundData.players[nextToPlay].username}'s turn!`;
          this.roundData.players[nextToPlay].status = 'Playing card...';

          // update status
        }
      });
  }
  private listenForHitWinner(): void {
    this.gameService.listenForHitWinner()
      .pipe(takeUntil(this.playingSubj))
      .subscribe(data => {
        console.log('listenForHitWinner', data);
        this.cardOnTop = null;
        this.roundData.players.forEach(playa => playa.status = 'Waiting...');

        // if u won u start
        if (data.winnerId === this.userId) {
          this.canPlay = true;
          this.userInfo = `You won this hand and it's your turn!`;
        } else {
          this.canPlay = false;
          const nextToPlay = this.roundData.players.findIndex(playa => playa.uniqueId === data.winnerId);
          this.userInfo = `${this.roundData.players[nextToPlay].username} won this hand and it's their turn!`;
          this.roundData.players[nextToPlay].status = 'Playing card...';


        }
      });
  }
  private listenForRoundEnd(): void {
    this.gameService.listenForRoundEnd()
      .pipe(first())
      .subscribe(data => {
        this.cardOnTop = Object.assign({}, data.lastCard);
        this.rankedPlayers = Array.from(data.scoreboard);
        this.playingSubj.next();
        this.playingSubj.complete();
        this.playingSubj = new Subject<any>();
        console.log('listenForRoundEnd', data);
        // round results displayed
        this.openRoundResultModal(data.roundBets);
      });
  }
}
