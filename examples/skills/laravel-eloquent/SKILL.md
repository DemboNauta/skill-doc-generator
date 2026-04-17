---
name: laravel-eloquent
description: Guide for working with Laravel Eloquent ORM (Laravel 13.x) — models, queries, relationships, mutators/casting, collections, and API resources.
triggers:
  - User asks about Eloquent models, queries, or ORM
  - Working with Laravel database models, relationships, scopes
  - Creating/editing files in app/Models/
  - Questions about soft deletes, mass assignment, upserts
  - Building API resources or transforming Eloquent models to JSON
  - Accessors, mutators, or attribute casting
---

# Laravel Eloquent ORM (13.x)

## Model Generation

```bash
php artisan make:model Flight                          # basic model
php artisan make:model Flight -m                       # + migration
php artisan make:model Flight -mfsc                    # + migration, factory, seeder, controller
php artisan make:model Flight -a                       # all: migration, factory, seeder, policy, controller, requests
php artisan make:model Member --pivot                  # pivot model
php artisan model:show Flight                          # inspect attributes & relations
```

## Model Conventions

```php
// Table name: snake_case plural of class (Flight → flights)
// Override with PHP attribute:
#[Table('my_flights')]
class Flight extends Model {}

// Custom primary key
#[Table(key: 'flight_id')]
// Non-incrementing string key
#[Table(key: 'uuid', keyType: 'string', incrementing: false)]

// UUID / ULID keys
class Article extends Model { use HasUuids; }   // UUIDv7 by default
class Article extends Model { use HasUlids; }

// Disable timestamps
#[WithoutTimestamps]
// Custom timestamp column names
public const CREATED_AT = 'creation_date';
public const UPDATED_AT = 'updated_date';

// Custom DB connection
#[Connection('mysql')]

// Default attribute values
protected $attributes = ['delayed' => false, 'options' => '[]'];
```

## Strictness (AppServiceProvider::boot)

```php
Model::preventLazyLoading(! $this->app->isProduction());
Model::preventSilentlyDiscardingAttributes(! $this->app->isProduction());
```

## Retrieving Models

```php
// All records
Flight::all();

// Query builder
$flights = Flight::where('active', 1)->orderBy('name')->limit(10)->get();

// Single record
Flight::find(1);
Flight::findOrFail(1);                    // throws ModelNotFoundException
Flight::where('number', 'FR 900')->first();
Flight::firstOrCreate(['name' => 'London'], ['delayed' => false]);
Flight::firstOrNew(['name' => 'London']);
Flight::updateOrCreate(['departure' => 'Oakland'], ['price' => 99]);

// Aggregates
Flight::where('active', 1)->count();
Flight::max('price');

// Refresh
$fresh = $flight->fresh();    // new instance, does not affect original
$flight->refresh();           // re-hydrates in place, including loaded relations

// Large datasets — avoid memory issues
Flight::chunk(200, function (Collection $flights) { /* ... */ });
Flight::chunkById(200, fn ($flights) => /* ... */, 'id');
Flight::lazy()->each(fn ($flight) => /* ... */);    // lazy collection / cursor
```

## Inserting & Updating

```php
// Create
$flight = new Flight;
$flight->name = 'London';
$flight->save();

// Mass assignment (requires $fillable or $guarded)
protected $fillable = ['name', 'destination'];   // allowlist
protected $guarded  = [];                        // allow all (use carefully)

Flight::create(['name' => 'London', 'destination' => 'Paris']);

// Update
$flight->update(['delayed' => true]);
Flight::where('active', 1)->update(['delayed' => false]);   // mass update

// Upsert
Flight::upsert(
    [['departure' => 'Oakland', 'destination' => 'San Diego', 'price' => 99]],
    ['departure', 'destination'],   // unique columns
    ['price']                       // columns to update on match
);

// Without touching updated_at
Model::withoutTimestamps(fn () => $post->increment('reads'));
```

## Deleting Models

```php
$flight->delete();
Flight::destroy([1, 2, 3]);
Flight::where('active', 0)->delete();

// Soft deletes — add SoftDeletes trait + deleted_at column in migration
use Illuminate\Database\Eloquent\SoftDeletes;
class Flight extends Model { use SoftDeletes; }

$flight->trashed();                 // bool
Flight::withTrashed()->get();
Flight::onlyTrashed()->get();
$flight->restore();
$flight->forceDelete();

// Pruning — add Prunable/MassPrunable trait, define prunable() query, schedule
php artisan model:prune --pretend
```

## Query Scopes

```php
// Global scope (applies to all queries on model)
protected static function booted(): void
{
    static::addGlobalScope('active', fn (Builder $builder) => $builder->where('active', 1));
}

// Remove global scope
Flight::withoutGlobalScope('active')->get();

// Local scope
public function scopeActive(Builder $query): void
{
    $query->where('active', 1);
}
// Usage:
Flight::active()->orderBy('name')->get();

// Pending attributes scope (sets attributes on model when scope applied)
public function scopeForCurrentUser(Builder $query): Builder
{
    return $query->where('user_id', Auth::id())->withPendingAttributes(['user_id' => Auth::id()]);
}
```

## Relationships

### Defining

```php
// One to One
public function phone(): HasOne
{
    return $this->hasOne(Phone::class);           // FK: user_id on phones
}

// Inverse
public function user(): BelongsTo
{
    return $this->belongsTo(User::class);
}

// One to Many
public function comments(): HasMany
{
    return $this->hasMany(Comment::class)->chaperone(); // auto-hydrate parent
}

// Many to Many
public function roles(): BelongsToMany
{
    return $this->belongsToMany(Role::class);
}
// Access pivot: $user->roles->first()->pivot->created_at

// Has One of Many
public function latestOrder(): HasOne
{
    return $this->hasOne(Order::class)->latestOfMany();
}
public function largestOrder(): HasOne
{
    return $this->hasOne(Order::class)->ofMany('price', 'max');
}

// Has One / Has Many Through
public function mechanic(): HasOneThrough
{
    return $this->hasOneThrough(Owner::class, Car::class);
}

// Polymorphic
public function comments(): MorphMany
{
    return $this->morphMany(Comment::class, 'commentable');
}

// Default model (Null Object pattern)
public function user(): BelongsTo
{
    return $this->belongsTo(User::class)->withDefault(['name' => 'Guest']);
}
```

### Querying

```php
// Eager loading — prevents N+1
Post::with('comments')->get();
Post::with(['comments', 'author'])->get();
Post::with('comments.author')->get();          // nested

// Constrained eager load
Post::with(['comments' => fn ($q) => $q->where('active', 1)])->get();

// Lazy eager load (after retrieval)
$posts->load('comments');
$posts->loadMissing('comments');

// Existence / absence
Post::has('comments')->get();
Post::has('comments', '>=', 3)->get();
Post::whereHas('comments', fn ($q) => $q->where('content', 'like', '%code%'))->get();
Post::doesntHave('comments')->get();

// Aggregate on relation
Post::withCount('comments')->get();             // $post->comments_count
Post::withMin('price', 'amount')->get();

// whereBelongsTo
Post::whereBelongsTo($user)->get();
Post::whereBelongsTo($user, 'author')->get();   // custom relationship name
```

## Accessors, Mutators & Casting

```php
// Accessor + Mutator (Attribute class)
protected function firstName(): Attribute
{
    return Attribute::make(
        get: fn (string $value) => ucfirst($value),
        set: fn (string $value) => strtolower($value),
    );
}

// Cast via casts() method
protected function casts(): array
{
    return [
        'is_admin'   => 'boolean',
        'options'    => 'array',          // JSON ↔ PHP array
        'options'    => AsCollection::class,
        'options'    => AsArrayObject::class,
        'birthday'   => 'date',
        'created_at' => 'datetime:Y-m-d',
        'role'       => UserRole::class,  // PHP enum cast
        'secret'     => 'encrypted',
    ];
}
```

## Collections

Eloquent collections extend Laravel's base `Collection` with extra model-specific methods:

```php
$users->find(1);
$users->findOrFail(1);
$users->fresh();                        // re-fetch all from DB
$users->load(['comments', 'posts']);    // eager load on collection
$users->loadMissing('comments');
$users->modelKeys();                    // [1, 2, 3, ...]
$users->only([1, 2, 3]);
$users->except([4, 5]);
$users->makeVisible(['phone']);
$users->makeHidden(['password']);
$users->toQuery()->update(['status' => 'active']); // bulk update
$users->unique();

// Custom collection
#[CollectedBy(UserCollection::class)]
class User extends Model {}
```

## API Resources

```bash
php artisan make:resource UserResource
php artisan make:resource UserCollection   # resource collection
```

```php
// Single resource
class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'         => $this->id,
            'name'       => $this->name,
            'email'      => $this->email,
            'posts'      => PostResource::collection($this->posts),
            'created_at' => $this->created_at,
        ];
    }
}

// Return from route/controller
return new UserResource(User::findOrFail($id));
return User::findOrFail($id)->toResource();          // convention-based
return UserResource::collection(User::all());
return User::all()->toResourceCollection();          // convention-based

// Disable data wrapping (in AppServiceProvider::boot)
JsonResource::withoutWrapping();

// Conditional attributes
'secret' => $this->when(Auth::user()->isAdmin(), $this->secret),
'posts'  => PostResource::collection($this->whenLoaded('posts')),
```

## Events & Observers

```php
// Model events: retrieved, creating, created, updating, updated,
//               saving, saved, deleting, deleted, restoring, restored

// Observer class
php artisan make:observer UserObserver --model=User

class UserObserver
{
    public function created(User $user): void { /* ... */ }
    public function updated(User $user): void { /* ... */ }
}

// Register in AppServiceProvider::boot
User::observe(UserObserver::class);

// Mute events temporarily
User::withoutEvents(fn () => User::factory()->create());
```

## Quick Reference

| Task | Method |
|------|--------|
| Find or 404 | `Model::findOrFail($id)` |
| First or create | `Model::firstOrCreate(['key' => $val], $extra)` |
| Upsert | `Model::upsert($data, $unique, $update)` |
| Soft delete restore | `$model->restore()` |
| Force delete | `$model->forceDelete()` |
| Eager load | `Model::with('relation')->get()` |
| Prevent N+1 | `Model::preventLazyLoading(true)` |
| Chunk large sets | `Model::chunk(200, fn($rows) => ...)` |
| Mass update | `Model::where(...)->update([...])` |
| Scope | `public function scopeName(Builder $q)` |
| JSON cast | `'column' => 'array'` in `casts()` |
| API resource | `return new UserResource($model)` |
