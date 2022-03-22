#include <eosio/eosio.hpp>

using namespace eosio;

class [[eosio::contract]] sender : public contract {
public:
   using contract::contract;

   void receive(int64_t value);

   [[eosio::action]]
   void send1(name owner, int64_t value)
   {
      print(" 1 ");

      require_auth(owner);

      send2_action s2_action(get_self(), {get_self(), "active"_n});
      s2_action.send(owner, value);
   }

   using receive1_action = action_wrapper<"receive1"_n, &sender::receive>;
   using receive2_action = action_wrapper<"receive2"_n, &sender::receive>;

   [[eosio::action]]
   void send2(name owner, int64_t value)
   {
      print(" 2 ");

      require_auth(owner);

      receive1_action r1_action("receiver"_n, {get_self(), "active"_n});
      r1_action.send(value);

      require_recipient("notified1"_n);
      require_recipient("notified2"_n);

      receive2_action r2_action("receiver"_n, {get_self(), "active"_n});
      r2_action.send(value);
   }

   using send2_action = action_wrapper<"send2"_n, &sender::send2>;
};