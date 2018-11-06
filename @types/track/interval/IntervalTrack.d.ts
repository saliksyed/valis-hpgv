import UsageCache from "engine/ds/UsageCache";
import { Object2D } from "engine/ui/Object2D";
import IntervalInstances, { IntervalInstance } from "../../ui/util/IntervalInstances";
import { Tile } from "../TileLoader";
import TrackObject from "../TrackObject";
import IntervalTileLoader, { IntervalTilePayload } from "./IntervalTileLoader";
import { IntervalTrackModel } from "./IntervalTrackModel";
export declare class IntervalTrack extends TrackObject<IntervalTrackModel, IntervalTileLoader> {
    constructor(model: IntervalTrackModel);
    protected _pendingTiles: UsageCache<Tile<any>>;
    protected _intervalTileCache: UsageCache<IntervalInstances>;
    protected _onStage: UsageCache<Object2D>;
    protected updateDisplay(): void;
    protected displayTileNode(tile: Tile<IntervalTilePayload>, z: number, x0: number, span: number, continuousLodLevel: number): IntervalInstances;
    protected createTileNode(tile: Tile<IntervalTilePayload>): IntervalInstances;
    protected createInstance(relativeX: number, relativeW: number): IntervalInstance;
    protected removeTile: (tile: IntervalInstances) => void;
}
export default IntervalTrack;
